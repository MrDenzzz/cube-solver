import type { NotationError } from '@cube/core';
import { useId } from 'react';
import { useI18n, type I18n } from '../i18n/i18n.ts';
import styles from '../ui/ui.module.css';

function describe(error: NotationError, t: I18n['t']): string {
  const position = error.start + 1;
  switch (error.code) {
    case 'unexpected-character':
      return t('scramble.error.unexpected-character', { token: error.character, position });
    case 'invalid-move':
      return t('scramble.error.invalid-move', { token: error.token, position });
    case 'not-wca':
      return t('scramble.error.not-wca', { token: error.token, position });
    case 'layer-out-of-range':
      return t('scramble.error.layer-out-of-range', {
        token: error.token,
        position,
        size: error.size,
      });
  }
}

export function ScrambleInput({
  text,
  errors,
  generating,
  canGenerate,
  onChange,
  onRandom,
}: {
  readonly text: string;
  readonly errors: readonly NotationError[];
  readonly generating: boolean;
  readonly canGenerate: boolean;
  readonly onChange: (text: string) => void;
  readonly onRandom: () => void;
}) {
  const { t } = useI18n();
  const errorsId = useId();
  return (
    <>
      <label className={styles.label}>
        {t('scramble.label')}
        <textarea
          className={styles.textarea}
          value={text}
          placeholder={t('scramble.placeholder')}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          aria-invalid={errors.length > 0}
          aria-describedby={errors.length > 0 ? errorsId : undefined}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      </label>
      {errors.length > 0 && (
        <ul className={styles.errors} id={errorsId}>
          {errors.map((error) => (
            <li key={`${error.code}-${String(error.start)}`}>{describe(error, t)}</li>
          ))}
        </ul>
      )}
      <div className={styles.row}>
        <button
          type="button"
          className={styles.button}
          disabled={!canGenerate || generating}
          onClick={onRandom}
        >
          {generating ? t('scramble.generating') : t('scramble.random')}
        </button>
        <button
          type="button"
          className={styles.button}
          disabled={text.length === 0}
          onClick={() => {
            onChange('');
          }}
        >
          {t('scramble.clear')}
        </button>
      </div>
    </>
  );
}
