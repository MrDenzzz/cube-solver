import { FACES, isFace, type Face } from '@cube/core';
import {
  lazy,
  Suspense,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { useI18n } from '../i18n/i18n.ts';
import { FACE_COLOURS, UNKNOWN } from '../scheme.ts';
import { cx } from '../ui/cx.ts';
import ui from '../ui/ui.module.css';
import { capitalise, colourName, holdHint } from './describe.ts';
import styles from './StickerEditor.module.css';
import {
  blankStickers,
  colourCounts,
  colourForKey,
  faceOf,
  isFixed,
  netCell,
  nextSticker,
  paint,
  stickerToward,
  type PuzzleSize,
  type StickerCheck,
} from './stickers.ts';

/** Opposite colours side by side, the way cubers think of them. */
const PALETTE: readonly Face[] = ['U', 'D', 'F', 'B', 'R', 'L'];

// Only loaded when asked for: most visits never open the camera.
const CameraPanel = lazy(() =>
  import('../camera/CameraPanel.tsx').then((m) => ({ default: m.CameraPanel })),
);

const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

/**
 * The cube unfolded, painted sticker by sticker. Clicking paints with the selected colour; on a
 * keyboard, colour initials paint the selected sticker and move on in reading order, so a face
 * can be typed in letter by letter. Remount it (a `key`) when the size changes.
 */
export function StickerEditor({
  size,
  stickers,
  check,
  onChange,
}: {
  readonly size: PuzzleSize;
  readonly stickers: string;
  readonly check: StickerCheck<unknown>;
  readonly onChange: (stickers: string) => void;
}) {
  const { t } = useI18n();
  const perFace = size * size;
  const firstFront = FACES.indexOf('F') * perFace;
  const blank = useMemo(() => blankStickers(size), [size]);
  const [brush, setBrush] = useState<Face>('U');
  const [cursor, setCursor] = useState(firstFront);
  const [scanning, setScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState(false);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const counts = colourCounts(stickers);
  const highlighted = useMemo(
    () => new Set(check.kind === 'invalid' ? check.problems.flatMap((p) => p.facelets) : []),
    [check],
  );
  const activeFace = faceOf(cursor, size);

  const moveTo = (facelet: number) => {
    setCursor(facelet);
    buttons.current[facelet]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const step = ARROWS[event.key];
    const colour = colourForKey(event.key);
    if (step !== undefined) {
      moveTo(stickerToward(cursor, step[0], step[1], size));
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      onChange(paint(stickers, cursor, UNKNOWN, size));
    } else if (colour !== undefined) {
      setBrush(colour);
      onChange(paint(stickers, cursor, colour, size));
      moveTo(nextSticker(cursor, size));
    } else {
      return;
    }
    event.preventDefault();
  };

  const stickerLabel = (facelet: number) => {
    const symbol = stickers.charAt(facelet);
    const index = facelet % perFace;
    return capitalise(
      t('stickers.sticker', {
        face: t(`face.${faceOf(facelet, size)}`),
        row: Math.floor(index / size) + 1,
        column: (index % size) + 1,
        colour: isFace(symbol) ? colourName(symbol, t) : t('colour.unknown'),
      }),
    );
  };

  if (scanning) {
    return (
      <Suspense fallback={<p className={ui.muted}>{t('camera.starting')}</p>}>
        <CameraPanel
          size={size}
          onApply={({ stickers: scanned, ambiguous }) => {
            onChange(scanned);
            setScanNotice(ambiguous);
            setScanning(false);
          }}
          onClose={() => {
            setScanning(false);
          }}
        />
      </Suspense>
    );
  }

  return (
    <div className={styles.editor}>
      <p className={styles.hint}>{holdHint(activeFace, size, t)}</p>

      {/* One tab stop for the whole net: arrow keys move inside it. */}
      <div
        className={styles.net}
        style={{ '--size': size } as CSSProperties}
        role="group"
        aria-label={t('stickers.net')}
        onKeyDown={onKeyDown}
      >
        {FACES.map((face) => {
          const first = FACES.indexOf(face) * perFace;
          const [row, column] = netCell(first, size);
          return (
            <div
              key={face}
              className={styles.face}
              style={{ gridRow: row / size + 1, gridColumn: column / size + 1 }}
              data-active={face === activeFace}
              role="group"
              aria-label={capitalise(t('stickers.faceLabel', { face: t(`face.${face}`) }))}
            >
              {Array.from({ length: perFace }, (_, i) => {
                const facelet = first + i;
                const symbol = stickers.charAt(facelet);
                const colour = isFace(symbol) ? symbol : undefined;
                return (
                  <button
                    key={facelet}
                    ref={(button) => {
                      buttons.current[facelet] = button;
                    }}
                    type="button"
                    className={styles.sticker}
                    style={colour === undefined ? undefined : { background: FACE_COLOURS[colour] }}
                    tabIndex={facelet === cursor ? 0 : -1}
                    aria-label={stickerLabel(facelet)}
                    aria-current={facelet === cursor ? 'true' : undefined}
                    data-unknown={colour === undefined}
                    data-error={highlighted.has(facelet)}
                    data-centre={isFixed(facelet, size)}
                    onClick={() => {
                      setCursor(facelet);
                      onChange(paint(stickers, facelet, brush, size));
                    }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      <div className={styles.palette} role="radiogroup" aria-label={t('stickers.palette')}>
        {PALETTE.map((face) => (
          <button
            key={face}
            type="button"
            role="radio"
            className={styles.colour}
            aria-checked={brush === face}
            aria-label={t('stickers.count', {
              colour: capitalise(colourName(face, t)),
              count: counts[face],
              total: perFace,
            })}
            onClick={() => {
              setBrush(face);
            }}
          >
            <span className={styles.swatch} style={{ background: FACE_COLOURS[face] }} />
            <span className={styles.count} data-over={counts[face] > perFace}>
              {counts[face]}/{perFace}
            </span>
          </button>
        ))}
      </div>

      {scanNotice && <p className={ui.status}>{t('camera.ambiguous')}</p>}
      <StickerStatus check={check} />
      <p className={cx(ui.muted, styles.keys)}>{t('stickers.keys')}</p>
      <div className={ui.row}>
        <button
          type="button"
          className={ui.button}
          onClick={() => {
            setScanning(true);
          }}
        >
          {t('camera.open')}
        </button>
        <button
          type="button"
          className={ui.button}
          disabled={stickers === blank}
          onClick={() => {
            onChange(blank);
            setCursor(firstFront);
          }}
        >
          {t('stickers.clear')}
        </button>
      </div>
    </div>
  );
}

function StickerStatus({ check }: { readonly check: StickerCheck<unknown> }) {
  const { t } = useI18n();
  switch (check.kind) {
    case 'incomplete':
      return <p className={ui.muted}>{t('stickers.missing', { count: check.missing })}</p>;
    case 'valid':
      return <p className={ui.status}>{t('stickers.valid')}</p>;
    case 'invalid':
      return (
        <ul className={ui.errors} aria-live="polite">
          {check.problems.map((problem, i) => (
            // Problems have no identity beyond their place in this list, which is rebuilt each time.
            <li key={i}>{problem.describe(t)}</li>
          ))}
        </ul>
      );
  }
}
