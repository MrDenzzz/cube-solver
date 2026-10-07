import { createContext, use } from 'react';
import { MESSAGES, MOVES, type Language, type MessageKey } from './messages.ts';

export type Params = Readonly<Record<string, string | number>>;

// Function-valued properties rather than methods: components destructure them.
export interface I18n {
  readonly language: Language;
  readonly setLanguage: (language: Language) => void;
  readonly t: (key: MessageKey, params?: Params) => string;
  readonly moves: (count: number) => string;
  readonly number: (value: number) => string;
  /** Large counts in short form: 12 billion, 12 млрд. */
  readonly compact: (value: number) => string;
  readonly duration: (ms: number) => string;
}

function interpolate(template: string, params: Params, format: (n: number) => string): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    if (value === undefined) return match;
    return typeof value === 'number' ? format(value) : value;
  });
}

export function createI18n(language: Language, setLanguage: (l: Language) => void): I18n {
  const numberFormat = new Intl.NumberFormat(language);
  const plural = new Intl.PluralRules(language);
  const format = (n: number) => numberFormat.format(n);
  const compactFormat = new Intl.NumberFormat(language, {
    notation: 'compact',
    compactDisplay: 'long',
    maximumFractionDigits: 1,
  });
  const decimal = new Intl.NumberFormat(language, { maximumFractionDigits: 1 });
  const messages = MESSAGES[language];
  const fill = (key: MessageKey, params: Params) => interpolate(messages[key], params, format);
  return {
    language,
    setLanguage,
    t: (key, params = {}) => fill(key, params),
    moves: (count) => {
      const forms = MOVES[language];
      return interpolate(forms[plural.select(count)] ?? forms.other, { n: count }, format);
    },
    number: format,
    compact: (value) => compactFormat.format(value),
    duration: (ms) => {
      if (ms < 1000) return fill('time.ms', { n: String(Math.round(ms)) });
      if (ms < 60_000) return fill('time.s', { n: decimal.format(ms / 1000) });
      const seconds = Math.round(ms / 1000);
      return fill('time.min', { m: Math.floor(seconds / 60), s: seconds % 60 });
    },
  };
}

export const I18nContext = createContext<I18n | null>(null);

export function useI18n(): I18n {
  const i18n = use(I18nContext);
  if (i18n === null) throw new Error('useI18n must be used inside <I18nProvider>');
  return i18n;
}
