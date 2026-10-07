import { FACES, isFace, type Face } from '@cube/core';
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useI18n } from '../i18n/i18n.ts';
import { FACE_COLOURS, UNKNOWN } from '../scheme.ts';
import { cx } from '../ui/cx.ts';
import ui from '../ui/ui.module.css';
import { capitalise, colourName, describeCubeError } from './describe.ts';
import styles from './StickerEditor.module.css';
import {
  BLANK_STICKERS,
  colourCounts,
  colourForKey,
  errorFacelets,
  faceOf,
  isCentre,
  netCell,
  nextSticker,
  paint,
  stickerToward,
  type StickerCheck,
} from './stickers.ts';

/** Opposite colours side by side, the way cubers think of them. */
const PALETTE: readonly Face[] = ['U', 'D', 'F', 'B', 'R', 'L'];

/** The colour on top while a face is held towards you, as the hints describe. */
const TOP: Readonly<Record<Face, Face>> = { U: 'B', R: 'U', F: 'U', D: 'F', L: 'U', B: 'U' };

const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

const STICKERS_PER_FACE = 9;
const FIRST_FRONT_STICKER = FACES.indexOf('F') * STICKERS_PER_FACE;

/**
 * The cube unfolded, painted sticker by sticker. Clicking paints with the selected colour; on a
 * keyboard, colour initials paint the selected sticker and move on in reading order, so a face
 * can be typed in as nine letters.
 */
export function StickerEditor({
  stickers,
  check,
  onChange,
}: {
  readonly stickers: string;
  readonly check: StickerCheck;
  readonly onChange: (stickers: string) => void;
}) {
  const { t } = useI18n();
  const [brush, setBrush] = useState<Face>('U');
  const [cursor, setCursor] = useState(FIRST_FRONT_STICKER);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const counts = colourCounts(stickers);
  const highlighted = useMemo(
    () => new Set(check.kind === 'invalid' ? check.errors.flatMap(errorFacelets) : []),
    [check],
  );
  const activeFace = faceOf(cursor);

  const moveTo = (facelet: number) => {
    setCursor(facelet);
    buttons.current[facelet]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const step = ARROWS[event.key];
    const colour = colourForKey(event.key);
    if (step !== undefined) {
      moveTo(stickerToward(cursor, step[0], step[1]));
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      onChange(paint(stickers, cursor, UNKNOWN));
    } else if (colour !== undefined) {
      setBrush(colour);
      onChange(paint(stickers, cursor, colour));
      moveTo(nextSticker(cursor));
    } else {
      return;
    }
    event.preventDefault();
  };

  const stickerLabel = (facelet: number) => {
    const symbol = stickers.charAt(facelet);
    const index = facelet % STICKERS_PER_FACE;
    return capitalise(
      t('stickers.sticker', {
        face: t(`face.${faceOf(facelet)}`),
        row: Math.floor(index / 3) + 1,
        column: (index % 3) + 1,
        colour: isFace(symbol) ? colourName(symbol, t) : t('colour.unknown'),
      }),
    );
  };

  return (
    <div className={styles.editor}>
      <p className={styles.hint}>
        {t(`stickers.hint.${activeFace}`, {
          facing: colourName(activeFace, t),
          top: colourName(TOP[activeFace], t),
        })}
      </p>

      {/* One tab stop for the whole net: arrow keys move inside it. */}
      <div className={styles.net} role="group" aria-label={t('stickers.net')} onKeyDown={onKeyDown}>
        {FACES.map((face) => {
          const first = FACES.indexOf(face) * STICKERS_PER_FACE;
          const [row, column] = netCell(first);
          return (
            <div
              key={face}
              className={styles.face}
              style={{ gridRow: row / 3 + 1, gridColumn: column / 3 + 1 }}
              data-active={face === activeFace}
              role="group"
              aria-label={capitalise(t('stickers.faceLabel', { face: t(`face.${face}`) }))}
            >
              {Array.from({ length: STICKERS_PER_FACE }, (_, i) => {
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
                    data-centre={isCentre(facelet)}
                    onClick={() => {
                      setCursor(facelet);
                      onChange(paint(stickers, facelet, brush));
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
            })}
            onClick={() => {
              setBrush(face);
            }}
          >
            <span className={styles.swatch} style={{ background: FACE_COLOURS[face] }} />
            <span className={styles.count} data-over={counts[face] > STICKERS_PER_FACE}>
              {counts[face]}/{STICKERS_PER_FACE}
            </span>
          </button>
        ))}
      </div>

      <StickerStatus check={check} />
      <p className={cx(ui.muted, styles.keys)}>{t('stickers.keys')}</p>
      <div className={ui.row}>
        <button
          type="button"
          className={ui.button}
          disabled={stickers === BLANK_STICKERS}
          onClick={() => {
            onChange(BLANK_STICKERS);
            setCursor(FIRST_FRONT_STICKER);
          }}
        >
          {t('stickers.clear')}
        </button>
      </div>
    </div>
  );
}

function StickerStatus({ check }: { readonly check: StickerCheck }) {
  const { t } = useI18n();
  switch (check.kind) {
    case 'incomplete':
      return <p className={ui.muted}>{t('stickers.missing', { count: check.missing })}</p>;
    case 'valid':
      return <p className={ui.status}>{t('stickers.valid')}</p>;
    case 'invalid':
      return (
        <ul className={ui.errors} aria-live="polite">
          {check.errors.map((error, i) => (
            // Errors have no identity beyond their place in this list, which is rebuilt each time.
            <li key={i}>{describeCubeError(error, t)}</li>
          ))}
        </ul>
      );
  }
}
