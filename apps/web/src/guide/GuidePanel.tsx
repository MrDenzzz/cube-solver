import type { Dispatch } from 'react';
import { useI18n, type I18n } from '../i18n/i18n.ts';
import { nextMove, type Playback, type PlaybackAction } from '../playback/playback.ts';
import { colourName } from '../stickers/describe.ts';
import { cx } from '../ui/cx.ts';
import ui from '../ui/ui.module.css';
import { describeMove, holdCorner, type MoveGuide } from './guide.ts';
import styles from './GuidePanel.module.css';

function layerName(guide: MoveGuide, t: I18n['t']): string {
  return guide.depth === 1
    ? t(`guide.face.${guide.face}`)
    : t(`guide.wide.${guide.face}`, { n: guide.depth });
}

function direction(guide: MoveGuide, t: I18n['t']): string {
  return guide.half
    ? t('guide.half')
    : t('guide.towards', {
        side: t(`guide.side.${guide.reference}`),
        direction: t(`guide.direction.${guide.towards}`),
      });
}

/** Step-by-step instructions for following the solution on a real cube. */
export function GuidePanel({
  playback,
  dispatch,
}: {
  readonly playback: Playback;
  readonly dispatch: Dispatch<PlaybackAction>;
}) {
  const { t, moves } = useI18n();
  const { position } = playback;
  const total = playback.moves.length;
  const next = nextMove(playback);
  const guide = next === null ? null : describeMove(next, playback.size);
  const busy = playback.animating !== null;
  // A 3×3×3 is held by its centres; a 4×4×4 has none, so by the corner at the top front right.
  const corner = playback.size === 3 ? null : holdCorner(playback.start, playback.size);
  const hold =
    corner === null
      ? t('guide.hold', { top: colourName('U', t), front: colourName('F', t) })
      : t('guide.hold4', {
          top: colourName(corner.top, t),
          front: colourName(corner.front, t),
          right: colourName(corner.right, t),
        });

  return (
    <section className={styles.guide}>
      <p className={ui.muted}>
        {hold}
        {position === 0 && ` ${t('guide.start')}`}
      </p>
      <div className={styles.step} aria-live="polite">
        {guide === null ? (
          <p className={styles.done}>{t('guide.done', { moves: moves(total) })}</p>
        ) : (
          <>
            {/* A typographic prime reads better than an apostrophe at this size. */}
            <span className={styles.notation}>{guide.notation.replace("'", '′')}</span>
            <div className={styles.text}>
              <p className={styles.layer}>
                {layerName(guide, t)}
                <span className={styles.counter}>
                  {t('guide.step', { n: position + 1, total })}
                </span>
              </p>
              <p className={styles.direction}>{direction(guide, t)}</p>
              {!guide.half && (
                <p className={ui.muted}>
                  {t(guide.clockwise ? 'guide.clockwise' : 'guide.counterClockwise', {
                    from: t(`guide.from.${guide.face}`),
                  })}
                </p>
              )}
            </div>
          </>
        )}
      </div>
      <div className={styles.buttons}>
        <button
          type="button"
          className={cx(ui.button, styles.big)}
          disabled={position === 0 || busy}
          onClick={() => {
            dispatch({ type: 'step', forward: false });
          }}
        >
          {t('guide.back')}
        </button>
        <button
          type="button"
          className={cx(ui.button, ui.primary, styles.big)}
          disabled={next === null || busy}
          onClick={() => {
            dispatch({ type: 'step', forward: true });
          }}
        >
          {t('guide.next')}
        </button>
      </div>
    </section>
  );
}
