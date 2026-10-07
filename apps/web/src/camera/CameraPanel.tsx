import { FACES } from '@cube/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/i18n.ts';
import { FACE_COLOURS } from '../scheme.ts';
import { holdHint } from '../stickers/describe.ts';
import { ENTRY_ORDER, type PuzzleSize } from '../stickers/stickers.ts';
import { cx } from '../ui/cx.ts';
import ui from '../ui/ui.module.css';
import styles from './CameraPanel.module.css';
import { classifyStickers, paletteLab } from './colour.ts';
import { gridSquare, sampleGrid, type CellColour } from './sample.ts';

type CameraState =
  | { readonly kind: 'starting' }
  | { readonly kind: 'live'; readonly width: number; readonly height: number }
  | {
      readonly kind: 'error';
      readonly reason: 'denied' | 'missing' | 'unsupported' | 'failed';
      readonly message: string;
    };

/**
 * Reads the stickers with the camera, a face at a time in the editor's order and holds, so each
 * picture's rows and columns are the face's facelet order. Colours are only named once all six
 * faces are in, because every colour must cover exactly a face's worth of stickers.
 */
export function CameraPanel({
  size,
  onApply,
  onClose,
}: {
  readonly size: PuzzleSize;
  readonly onApply: (stickers: string) => void;
  readonly onClose: () => void;
}) {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState<CameraState>({ kind: 'starting' });
  const [step, setStep] = useState(0);
  const [captures, setCaptures] = useState<readonly (readonly CellColour[] | null)[]>(() =>
    ENTRY_ORDER.map(() => null),
  );
  const palette = useMemo(() => paletteLab(FACE_COLOURS), []);
  const face = ENTRY_ORDER[step] ?? 'F';
  const done = captures.filter((c) => c !== null).length;

  useEffect(() => {
    let stream: MediaStream | undefined;
    let stopped = false;
    const element = video.current;
    // Absent outside secure contexts.
    if (typeof navigator.mediaDevices === 'undefined' || element === null) {
      setCamera({ kind: 'error', reason: 'unsupported', message: '' });
      return;
    }
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      .then(async (opened) => {
        stream = opened;
        if (stopped) return;
        element.srcObject = opened;
        await element.play();
        setCamera({ kind: 'live', width: element.videoWidth, height: element.videoHeight });
      })
      .catch((error: unknown) => {
        if (stopped) return;
        const name = error instanceof DOMException ? error.name : '';
        const reason =
          name === 'NotAllowedError' ? 'denied' : name === 'NotFoundError' ? 'missing' : 'failed';
        setCamera({ kind: 'error', reason, message: String(error) });
      });
    return () => {
      stopped = true;
      for (const track of stream?.getTracks() ?? []) track.stop();
    };
  }, []);

  const capture = () => {
    const element = video.current;
    if (element === null || camera.kind !== 'live') return;
    const square = gridSquare(element.videoWidth, element.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = square.side;
    canvas.height = square.side;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) return;
    context.drawImage(
      element,
      square.x,
      square.y,
      square.side,
      square.side,
      0,
      0,
      square.side,
      square.side,
    );
    const cells = sampleGrid(context.getImageData(0, 0, square.side, square.side), size);
    const next = captures.map((c, i) => (i === step ? cells : c));
    setCaptures(next);
    const missing = ENTRY_ORDER.findIndex((_, i) => next[(step + 1 + i) % 6] === null);
    if (missing !== -1) setStep((step + 1 + missing) % 6);
  };

  const apply = () => {
    const samples = FACES.flatMap((f) =>
      (captures[ENTRY_ORDER.indexOf(f)] ?? []).map((c) => c.lab),
    );
    onApply(classifyStickers(samples, size, palette));
  };

  const square =
    camera.kind === 'live' ? gridSquare(camera.width, camera.height) : { x: 0, y: 0, side: 0 };

  return (
    <div className={styles.camera}>
      <p className={styles.hint}>{holdHint(face, size, t)}</p>
      <p className={ui.muted}>{t('camera.aim')}</p>
      <div
        className={styles.frame}
        style={
          camera.kind === 'live'
            ? { aspectRatio: `${String(camera.width)} / ${String(camera.height)}` }
            : undefined
        }
      >
        <video ref={video} className={styles.video} playsInline muted />
        {camera.kind === 'live' && (
          <div
            className={styles.grid}
            style={{
              left: `${String((square.x / camera.width) * 100)}%`,
              top: `${String((square.y / camera.height) * 100)}%`,
              width: `${String((square.side / camera.width) * 100)}%`,
              height: `${String((square.side / camera.height) * 100)}%`,
              gridTemplateColumns: `repeat(${String(size)}, 1fr)`,
            }}
            aria-hidden="true"
          >
            {Array.from({ length: size * size }, (_, i) => (
              <span key={i} className={styles.cell} />
            ))}
          </div>
        )}
        {camera.kind === 'starting' && <p className={styles.overlay}>{t('camera.starting')}</p>}
      </div>
      {camera.kind === 'error' && (
        <p className={ui.errors}>
          {camera.reason === 'failed'
            ? t('camera.error.failed', { message: camera.message })
            : t(`camera.error.${camera.reason}`)}
        </p>
      )}

      <div className={styles.faces} role="group" aria-label={t('camera.faces')}>
        {ENTRY_ORDER.map((f, i) => {
          const cells = captures[i] ?? null;
          return (
            <button
              key={f}
              type="button"
              className={styles.face}
              aria-pressed={i === step}
              aria-label={t('camera.face', { face: t(`face.${f}`) })}
              onClick={() => {
                setStep(i);
              }}
            >
              <span
                className={styles.thumb}
                style={{ gridTemplateColumns: `repeat(${String(size)}, 1fr)` }}
              >
                {Array.from({ length: size * size }, (_, k) => (
                  <span
                    key={k}
                    style={cells === null ? undefined : { background: cells[k]?.css }}
                  />
                ))}
              </span>
              <span className={styles.label}>{t(`face.${f}`)}</span>
            </button>
          );
        })}
      </div>
      <p className={ui.muted}>{t('camera.progress', { count: done })}</p>
      <div className={ui.row}>
        <button
          type="button"
          className={cx(ui.button, ui.primary)}
          disabled={camera.kind !== 'live'}
          onClick={capture}
        >
          {t('camera.capture')}
        </button>
        <button type="button" className={ui.button} disabled={done < 6} onClick={apply}>
          {t('camera.apply')}
        </button>
        <button type="button" className={ui.button} onClick={onClose}>
          {t('camera.cancel')}
        </button>
      </div>
      <p className={ui.muted}>{t('camera.note')}</p>
    </div>
  );
}
