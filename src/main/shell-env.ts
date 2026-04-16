/**
 * Resolve environment variables from the user's login shell.
 *
 * Spawns the specified shell in interactive login mode and captures the full
 * environment, including PATH additions from .zshrc, .bashrc, nvm, homebrew, etc.
 * Works on macOS and Linux (both use /etc/shells and `-ilc`).
 *
 * When no supported shell is found, falls back to 'environment' which reads
 * from the current process.env.
 */
import { execFile } from 'child_process';
import { readFileSync } from 'fs';

/** Shells we know how to invoke with `-ilc`. */
const SUPPORTED_SHELL_NAMES = new Set(['zsh', 'bash']);

/** Special value meaning "use process.env". */
export const ENVIRONMENT_SOURCE = 'environment';

/**
 * List shells installed on the system that we support.
 * Reads /etc/shells and filters to shells whose basename is zsh or bash.
 * Falls back to ['environment'] if no supported shell is found.
 */
export function listAvailableShells(): string[] {
  try {
    const content = readFileSync('/etc/shells', 'utf8');
    const shells = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => {
        if (line.length === 0 || line.startsWith('#')) {
          return false;
        }
        const basename = line.split('/').pop() ?? '';
        return SUPPORTED_SHELL_NAMES.has(basename);
      });
    return shells.length > 0 ? shells : [ENVIRONMENT_SOURCE];
  } catch {
    return [ENVIRONMENT_SOURCE];
  }
}

/**
 * Get environment variables from a specific shell, or from process.env
 * if shell is 'environment'. Always fetches fresh (no caching).
 */
export async function getShellEnv(shell: string): Promise<Record<string, string>> {
  if (shell === ENVIRONMENT_SOURCE) {
    return Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined));
  }
  return resolveFromShell(shell);
}

function resolveFromShell(shell: string): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    execFile(shell, ['-ilc', 'env -0'], { encoding: 'utf8', timeout: 10_000, env: { TERM: 'dumb' } }, (err, stdout) => {
      if (err || !stdout) {
        resolve({});
        return;
      }

      const env: Record<string, string> = {};
      for (const entry of stdout.split('\0')) {
        const idx = entry.indexOf('=');
        if (idx > 0) {
          env[entry.slice(0, idx)] = entry.slice(idx + 1);
        }
      }
      resolve(env);
    });
  });
}
