import { useI18n } from '../i18n/i18n.ts';
import type { Language } from '../i18n/messages.ts';
import styles from './ui.module.css';

const LANGUAGES: readonly { readonly code: Language; readonly label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'ru', label: 'RU' },
];

export function LanguageSwitch() {
  const { language, setLanguage, t } = useI18n();
  return (
    <div className={styles.segmented} role="group" aria-label={t('language.label')}>
      {LANGUAGES.map(({ code, label }) => (
        <button
          key={code}
          type="button"
          className={styles.segment}
          aria-pressed={language === code}
          lang={code}
          onClick={() => {
            setLanguage(code);
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
