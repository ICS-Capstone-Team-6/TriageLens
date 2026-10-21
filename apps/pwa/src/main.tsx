import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Preview } from './screens/Preview';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {import.meta.env.DEV && new URLSearchParams(location.search).has('preview') ? (
      <Preview name={new URLSearchParams(location.search).get('preview') ?? ''} />
    ) : (
      <App />
    )}
  </StrictMode>,
);
