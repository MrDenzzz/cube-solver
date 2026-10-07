import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/i18n.ts';
import { FACE_COLOURS } from '../scheme.ts';
import type { PuzzleSize } from '../stickers/stickers.ts';
import { readStored, writeStored } from '../ui/storage.ts';
import ui from '../ui/ui.module.css';
import styles from './CameraPanel.module.css';
import { IDLE, matchingFace, watch, type Verdict, type Watch } from './capture.ts';
import { classifyFaces, paletteLab } from './colour.ts';
import { placeFaces } from './placement.ts';
import { gridSquare, readGrid, type CellColour, type GridReading } from './sample.ts';

type CameraState =
  | { readonly kind: 'starting' }
  | { readonly kind: 'live'; readonly width: number; readonly height: number }
  | {
      readonly kind: 'error';
      readonly reason:
        'denied' | 'missing' | 'busy' | 'dark' | 'stopped' | 'unsupported' | 'failed';
      readonly message: string;
    };

/** How often the picture is read, and the size it is read at: plenty for 16 stickers. */
const READ_EVERY_MS = 125;
const READ_SIDE = 240;

/** How long a camera may take to send its first picture. */
const FIRST_PICTURE_MS = 4000;
/** Readings in a row that are all but black before the camera is reported as dark: 3 s. */
const DARK_READINGS = 24;
/** Smaller than this is no picture: a stopped camera can leave a video of a few pixels. */
const MIN_PICTURE = 32;
const CAMERA_KEY = 'cube-solver.camera';

/**
 * Phones and tablets have a rear camera to ask for. A computer is not asked for one: with
 * several cameras (virtual ones, a phone linked as a webcam) one may call itself rear-facing,
 * get chosen, and send nothing, while the browser's own choice works.
 */
const hasRearCamera = () => matchMedia('(pointer: coarse)').matches;

/**
 * Opens a camera: the one picked, else the rear one on a phone, else the browser's default. No
 * size is asked for: the camera's own is plenty for a grid read at 240 px, and asking a webcam
 * for 1280×720 made it fail to start, or stop a second later when applied to a running stream.
 * If the first choice will not start, or the picked camera is gone, the browser's default is
 * asked.
 */
async function openCamera(deviceId: string | null): Promise<MediaStream> {
  const first: MediaTrackConstraints | true =
    deviceId !== null
      ? { deviceId: { exact: deviceId } }
      : hasRearCamera()
        ? { facingMode: { ideal: 'environment' } }
        : true;
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: first, audio: false });
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    const retry = ['NotReadableError', 'OverconstrainedError', 'NotFoundError'].includes(name);
    if (first === true || !retry) throw error;
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
  return stream;
}

const hasPicture = (element: HTMLVideoElement) =>
  element.videoWidth >= MIN_PICTURE && element.videoHeight >= MIN_PICTURE;

/** Whether the video gets a picture within FIRST_PICTURE_MS. */
function firstPicture(element: HTMLVideoElement): Promise<boolean> {
  return new Promise((resolve) => {
    if (hasPicture(element)) {
      resolve(true);
      return;
    }
    const done = (ok: boolean) => {
      clearTimeout(timer);
      element.removeEventListener('resize', onResize);
      resolve(ok);
    };
    const onResize = () => {
      if (hasPicture(element)) done(true);
    };
    const timer = setTimeout(() => {
      done(false);
    }, FIRST_PICTURE_MS);
    element.addEventListener('resize', onResize);
  });
}

const REASONS: Readonly<Record<string, 'denied' | 'missing' | 'busy'>> = {
  NotAllowedError: 'denied',
  SecurityError: 'denied',
  NotFoundError: 'missing',
  // Windows gives a camera to one program at a time; a virtual camera that is not running fails
  // the same way.
  NotReadableError: 'busy',
  AbortError: 'busy',
};

export interface ScanResult {
  readonly stickers: string;
  /** Whether the pictures fit the cube in more than one way, so the result needs a look. */
  readonly ambiguous: boolean;
}

/**
 * Reads the stickers with the camera. Faces are shown one at a time, in any order and any way
 * up; a face is taken by itself once it fills the grid and holds still. With all six, the
 * colours are named and the pictures placed on the cube (see placement.ts).
 */
export function CameraPanel({
  size,
  onApply,
  onClose,
}: {
  readonly size: PuzzleSize;
  readonly onApply: (result: ScanResult) => void;
  readonly onClose: () => void;
}) {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [camera, setCamera] = useState<CameraState>({ kind: 'starting' });
  const [taken, setTaken] = useState<readonly (readonly CellColour[])[]>([]);
  const [live, setLive] = useState<GridReading | null>(null);
  const [verdict, setVerdict] = useState<Verdict>('none');
  const [unplaceable, setUnplaceable] = useState(false);
  // A new attempt restarts the camera, with the device picked if there is a choice.
  const [attempt, setAttempt] = useState<{ readonly deviceId: string | null; readonly n: number }>(
    () => ({ deviceId: readStored(CAMERA_KEY), n: 0 }),
  );
  const [devices, setDevices] = useState<readonly MediaDeviceInfo[]>([]);
  // The camera actually open, which the browser chose when none was picked.
  const [active, setActive] = useState<string | null>(null);
  const [dark, setDark] = useState(false);
  const darkReadings = useRef(0);
  const watching = useRef<Watch>(IDLE);
  // The reading loop runs outside React's renders and needs the latest pictures.
  const takenNow = useRef(taken);
  const palette = useMemo(() => paletteLab(FACE_COLOURS), []);

  useEffect(() => {
    let stream: MediaStream | undefined;
    // Read through a function: a check after an await must see the cleanup's change.
    const run = { stopped: false };
    const stopped = () => run.stopped;
    const element = video.current;
    // Absent outside secure contexts.
    if (typeof navigator.mediaDevices === 'undefined' || element === null) {
      setCamera({ kind: 'error', reason: 'unsupported', message: '' });
      return;
    }
    setCamera({ kind: 'starting' });
    // Labels are only given once the page may use a camera, so the list comes after asking.
    const listDevices = () => {
      navigator.mediaDevices.enumerateDevices().then(
        (all) => {
          if (!stopped()) setDevices(all.filter((d) => d.kind === 'videoinput'));
        },
        () => undefined,
      );
    };
    // The size can change after the camera starts, and collapse when it stops.
    const onResize = () => {
      if (hasPicture(element)) {
        setCamera({ kind: 'live', width: element.videoWidth, height: element.videoHeight });
      } else {
        setCamera({ kind: 'error', reason: 'stopped', message: '' });
      }
    };
    const onEnded = () => {
      if (!stopped()) setCamera({ kind: 'error', reason: 'stopped', message: '' });
    };
    openCamera(attempt.deviceId)
      .then(async (opened) => {
        stream = opened;
        if (stopped()) return;
        const track = opened.getVideoTracks()[0];
        setActive(track?.getSettings().deviceId ?? null);
        // A camera can stop by itself: unplugged, or taken by another program.
        track?.addEventListener('ended', onEnded);
        element.srcObject = opened;
        // Not awaited: on a stream that never sends a frame it would never settle.
        element.play().catch(() => undefined);
        listDevices();
        if (!(await firstPicture(element))) {
          if (!stopped()) setCamera({ kind: 'error', reason: 'dark', message: '' });
          return;
        }
        if (stopped()) return;
        element.addEventListener('resize', onResize);
        onResize();
      })
      .catch((error: unknown) => {
        if (stopped()) return;
        const name = error instanceof DOMException ? error.name : '';
        setCamera({ kind: 'error', reason: REASONS[name] ?? 'failed', message: String(error) });
        listDevices();
      });
    return () => {
      run.stopped = true;
      element.removeEventListener('resize', onResize);
      for (const track of stream?.getTracks() ?? []) track.stop();
    };
  }, [attempt]);

  /** The grid's square of the current frame, scaled down and read. */
  const read = useCallback((): GridReading | null => {
    const element = video.current;
    if (element === null || element.videoWidth === 0) return null;
    canvas.current ??= document.createElement('canvas');
    canvas.current.width = READ_SIDE;
    canvas.current.height = READ_SIDE;
    const context = canvas.current.getContext('2d', { willReadFrequently: true });
    if (context === null) return null;
    const { x, y, side } = gridSquare(element.videoWidth, element.videoHeight);
    context.drawImage(element, x, y, side, side, 0, 0, READ_SIDE, READ_SIDE);
    return readGrid(context.getImageData(0, 0, READ_SIDE, READ_SIDE), size);
  }, [size]);

  const finish = useCallback(
    (faces: readonly (readonly CellColour[])[]) => {
      const letters = classifyFaces(
        faces.map((cells) => cells.map((c) => c.lab)),
        size,
        palette,
      );
      const placed = placeFaces(letters, size);
      if (placed === null) setUnplaceable(true);
      else onApply({ stickers: placed.stickers, ambiguous: placed.ambiguous });
    },
    [onApply, palette, size],
  );

  const take = useCallback(
    (cells: readonly CellColour[]) => {
      const current = takenNow.current;
      if (current.length >= 6 || matchingFace(cells, current, size) !== -1) return;
      const next = [...current, cells];
      takenNow.current = next;
      setTaken(next);
      if ('vibrate' in navigator) navigator.vibrate(60);
      if (next.length === 6) finish(next);
    },
    [finish, size],
  );

  useEffect(() => {
    if (camera.kind !== 'live') return;
    const timer = setInterval(() => {
      const reading = read();
      if (reading === null) return;
      setLive(reading);
      // A picture that stays black: a camera that runs but shows nothing, like an idle virtual one.
      const black = reading.cells.every((cell) => cell.lab[0] < 4);
      darkReadings.current = black ? darkReadings.current + 1 : 0;
      setDark(darkReadings.current >= DARK_READINGS);
      const next = watch(watching.current, reading, takenNow.current, size);
      watching.current = next.state;
      setVerdict(next.verdict);
      if (next.verdict === 'take') take(reading.cells);
    }, READ_EVERY_MS);
    return () => {
      clearInterval(timer);
    };
  }, [camera.kind, read, size, take]);

  const remove = (index: number) => {
    const next = takenNow.current.filter((_, i) => i !== index);
    takenNow.current = next;
    setTaken(next);
    setUnplaceable(false);
  };

  const square =
    camera.kind === 'live' ? gridSquare(camera.width, camera.height) : { x: 0, y: 0, side: 0 };
  const status = unplaceable
    ? t('camera.unplaceable')
    : verdict === 'taken-already'
      ? t('camera.status.again')
      : verdict === 'steadying'
        ? t('camera.status.steady')
        : t('camera.status.search');

  return (
    <div className={styles.camera}>
      <p className={styles.hint}>{t('camera.aim')}</p>
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
            data-verdict={verdict}
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
              <span key={i} className={styles.cell}>
                {verdict !== 'none' && (
                  <span className={styles.dot} style={{ background: live?.cells[i]?.css }} />
                )}
              </span>
            ))}
          </div>
        )}
        {camera.kind === 'starting' && <p className={styles.overlay}>{t('camera.starting')}</p>}
      </div>
      {camera.kind === 'error' && (
        <>
          <p className={ui.errors}>
            {camera.reason === 'failed'
              ? t('camera.error.failed', { message: camera.message })
              : t(`camera.error.${camera.reason}`)}
          </p>
          {camera.reason !== 'unsupported' && (
            <div className={ui.row}>
              <button
                type="button"
                className={ui.button}
                onClick={() => {
                  setAttempt((a) => ({ ...a, n: a.n + 1 }));
                }}
              >
                {t('camera.retry')}
              </button>
            </div>
          )}
        </>
      )}
      {devices.length > 1 && (
        <label className={ui.label}>
          {t('camera.device')}
          <select
            className={ui.select}
            value={attempt.deviceId ?? active ?? ''}
            onChange={(event) => {
              const deviceId = event.target.value === '' ? null : event.target.value;
              writeStored(CAMERA_KEY, deviceId ?? '');
              setAttempt((a) => ({ deviceId, n: a.n + 1 }));
            }}
          >
            <option value="">{t('camera.default')}</option>
            {devices.map((device, i) => (
              <option key={device.deviceId || i} value={device.deviceId}>
                {device.label || t('camera.numbered', { n: i + 1 })}
              </option>
            ))}
          </select>
        </label>
      )}
      {camera.kind === 'live' && (
        <p className={unplaceable || dark ? ui.errors : ui.status} aria-live="polite">
          {dark ? t('camera.error.dark') : status}
        </p>
      )}

      <div className={styles.faces} role="group" aria-label={t('camera.faces')}>
        {Array.from({ length: 6 }, (_, i) => {
          const cells = taken[i];
          return cells === undefined ? (
            <span key={i} className={styles.face} data-empty="true">
              <span className={styles.thumb} />
            </span>
          ) : (
            <button
              key={i}
              type="button"
              className={styles.face}
              title={t('camera.remove')}
              aria-label={t('camera.removeFace', { n: i + 1 })}
              onClick={() => {
                remove(i);
              }}
            >
              <span
                className={styles.thumb}
                style={{ gridTemplateColumns: `repeat(${String(size)}, 1fr)` }}
              >
                {cells.map((cell, k) => (
                  <span key={k} style={{ background: cell.css }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <p className={ui.muted}>{t('camera.progress', { count: taken.length })}</p>
      <div className={ui.row}>
        <button
          type="button"
          className={ui.button}
          disabled={camera.kind !== 'live' || taken.length >= 6}
          onClick={() => {
            const reading = read();
            if (reading !== null) take(reading.cells);
          }}
        >
          {t('camera.capture')}
        </button>
        <button type="button" className={ui.button} onClick={onClose}>
          {t('camera.cancel')}
        </button>
      </div>
      <p className={ui.muted}>{t('camera.note')}</p>
    </div>
  );
}
