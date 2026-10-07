import type { ReactNode } from 'react';
import { useI18n } from '../i18n/i18n.ts';
import ui from '../ui/ui.module.css';

export type InputMode = 'scramble' | 'stickers';

const MODES: readonly InputMode[] = ['scramble', 'stickers'];

/** The ways to describe the cube to solve, one at a time. */
export function InputPanel({
  mode,
  onModeChange,
  children,
}: {
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
      {children}
    </section>
  );
}
