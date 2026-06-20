/**
 * Theme application for the renderer.
 *
 * Toggles the `.light` class on <html> based on the persisted theme source and,
 * when the source is 'system', the OS-level dark/light preference. Dark is the
 * default (no `.light` class), matching globals.css.
 */
export async function applyTheme(): Promise<void> {
  const theme = await window.api.getTheme();
  const dark = theme === 'dark' || (theme === 'system' && (await window.api.getNativeThemeDark()));
  document.documentElement.classList.toggle('light', !dark);
}
