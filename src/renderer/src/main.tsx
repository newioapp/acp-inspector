import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { applyTheme } from './theme';
import './globals.css';

void applyTheme();

// Re-apply when the OS theme changes (only affects the 'system' source, but
// applyTheme is a no-op for explicit light/dark).
window.api.onNativeThemeUpdated(() => {
  void applyTheme();
});

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
