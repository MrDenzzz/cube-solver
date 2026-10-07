import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Root } from './Root.tsx';
import { I18nProvider } from './i18n/I18nProvider.tsx';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Missing #root element in index.html');
}

createRoot(container).render(
  <StrictMode>
    <I18nProvider>
      <Root />
    </I18nProvider>
  </StrictMode>,
);
