import { formatFaceTurns, type FaceTurn } from '@cube/core';
import { useI18n } from '../i18n/i18n.ts';
import ui from '../ui/ui.module.css';
import styles from './MovesPanel.module.css';

/** The solution as clickable moves; clicking one shows the cube right after it. */
export function MovesPanel({
  moves,
  position,
  onSeek,
}: {
  readonly moves: readonly FaceTurn[];
  readonly position: number;
  readonly onSeek: (position: number) => void;
}) {
  const { t, moves: movesLabel } = useI18n();
  return (
    <section className={ui.card}>
      <h2 className={ui.cardTitle}>
        {t('playback.title')} · {movesLabel(moves.length)}
      </h2>
      <ol className={styles.moves}>
        {moves.map((move, index) => (
          // A move's place in the sequence is its identity; the same move can repeat.
          <li key={index}>
            <button
              type="button"
              className={styles.move}
              aria-current={index === position - 1 ? 'step' : undefined}
              data-done={index < position}
              onClick={() => {
                onSeek(index + 1);
              }}
            >
              {formatFaceTurns([move])}
            </button>
          </li>
        ))}
      </ol>
      <p className={ui.muted}>{t('playback.keys')}</p>
    </section>
  );
}
