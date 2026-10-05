import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createI18n, I18nContext } from './i18n.ts';
import type { Language } from './messages.ts';

const STORAGE_KEY = 'cube-solver.language';

function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'ru') return saved;
  } catch {
    // Storage can be unavailable (private mode, blocked site data); fall back to the browser.
  }
  return navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

export function I18nProvider({ children }: { readonly children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(initialLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Not persisting the choice is acceptable.
    }
  }, [language]);

  const i18n = useMemo(() => createI18n(language, setLanguage), [language]);
  return <I18nContext value={i18n}>{children}</I18nContext>;
}
