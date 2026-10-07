import { useI18n } from '../i18n/i18n.ts';
import styles from './Header.module.css';
import { PAGE_HASH, type Page } from './pages.ts';
import { LanguageSwitch } from './LanguageSwitch.tsx';

const REPOSITORY = 'https://github.com/MrDenzzz/cube-solver';

export function Header({ page }: { readonly page: Page }) {
  const { t } = useI18n();
  return (
    <header className={styles.header}>
      <div>
        <h1 className={styles.title}>{t('app.title')}</h1>
        <p className={styles.subtitle}>{t('app.subtitle')}</p>
      </div>
      <div className={styles.actions}>
        <nav className={styles.nav} aria-label={t('nav.label')}>
          {(['solver', 'bench'] as const).map((target) => (
            <a
              key={target}
              className={styles.page}
              href={PAGE_HASH[target]}
              aria-current={page === target ? 'page' : undefined}
            >
              {t(`nav.${target}`)}
            </a>
          ))}
        </nav>
        <LanguageSwitch />
        <a
          className={styles.link}
          href={REPOSITORY}
          target="_blank"
          rel="noreferrer"
          title={t('app.source')}
          aria-label={t('app.source')}
        >
          GitHub
        </a>
      </div>
    </header>
  );
}
