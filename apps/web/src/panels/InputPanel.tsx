import type { ReactNode } from 'react';
import { useI18n } from '../i18n/i18n.ts';
import type { PuzzleSize } from '../stickers/stickers.ts';
import ui from '../ui/ui.module.css';

export type InputMode = 'scramble' | 'stickers';

const MODES: readonly InputMode[] = ['scramble', 'stickers'];
const PUZZLES: readonly PuzzleSize[] = [3, 4];

/** The puzzle, and the ways to describe its state, one at a time. */
export function InputPanel({
  puzzle,
  onPuzzleChange,
  mode,
  onModeChange,
  children,
}: {
  readonly puzzle: PuzzleSize;
  readonly onPuzzleChange: (puzzle: PuzzleSize) => void;
  readonly mode: InputMode;
  readonly onModeChange: (mode: InputMode) => void;
  readonly children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <section className={ui.card}>
      <div className={ui.cardHeader}>
        <h2 className={ui.cardTitle}>{t('input.title')}</h2>
        <div className={ui.segmented} role="group" aria-label={t('input.title')}>
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              className={ui.segment}
              aria-pressed={mode === m}
              onClick={() => {
                onModeChange(m);
              }}
            >
              {t(`input.mode.${m}`)}
            </button>
          ))}
        </div>
      </div>
      <div className={ui.row}>
        <span className={ui.muted}>{t('input.puzzle')}</span>
        <div className={ui.segmented} role="group" aria-label={t('input.puzzle')}>
          {PUZZLES.map((size) => (
            <button
              key={size}
              type="button"
              className={ui.segment}
              aria-pressed={puzzle === size}
              onClick={() => {
                onPuzzleChange(size);
              }}
            >
              {`${String(size)}×${String(size)}×${String(size)}`}
            </button>
          ))}
        </div>
      </div>
      {children}
    </section>
  );
}
