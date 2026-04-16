import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './globals.css';

async function applyTheme(): Promise<void> {
  const theme = await window.api.getTheme();
  if (theme === 'dark' || (theme === 'system' && (await window.api.getNativeThemeDark()))) {
    document.documentElement.classList.remove('light');
  } else {
    document.documentElement.classList.add('light');
  }
}

void applyTheme();

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
