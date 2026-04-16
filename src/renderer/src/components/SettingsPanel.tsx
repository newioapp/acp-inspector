/**
 * SettingsPanel — theme selection overlay.
 */
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Dropdown, Label } from './ui';
import type { ThemeSource } from '../../../shared/types';

const THEME_OPTIONS = [
  { value: 'system' as const, label: 'System' },
  { value: 'light' as const, label: 'Light' },
  { value: 'dark' as const, label: 'Dark' },
];

export function SettingsPanel({ onClose }: { readonly onClose: () => void }): React.JSX.Element {
  const [theme, setTheme] = useState<ThemeSource>('system');

  useEffect(() => {
    void window.api.getTheme().then(setTheme);
  }, []);

  async function handleThemeChange(value: ThemeSource): Promise<void> {
    setTheme(value);
    await window.api.setTheme(value);
    // Re-apply theme class
    if (value === 'dark' || (value === 'system' && (await window.api.getNativeThemeDark()))) {
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
    }
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-80 rounded-lg border border-border bg-background p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Settings</h2>
          <button className="text-muted-foreground hover:text-foreground" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <Label text="Theme">
          <Dropdown options={THEME_OPTIONS} value={theme} onChange={(v) => void handleThemeChange(v)} />
        </Label>
      </div>
    </div>
  );
}
