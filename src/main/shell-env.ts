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
import { userInfo } from 'os';

/** Shells we know how to invoke with `-ilc`. */
const SUPPORTED_SHELL_NAMES = new Set(['zsh', 'bash']);

/**
 * Authoritative identity environment derived from the OS password database
 * (getpwuid of the process's real uid), NOT from the shell or process.env.
 *
 * A GUI app launched from the Dock is started by launchd with a minimal
 * environment, so USER/LOGNAME/HOME/SHELL can be missing or wrong (e.g. root).
 * Shells never set these — login(1) does — so sourcing them from `zsh -ilc`
 * just passes the bad values through. We compute them from the password
 * database instead, which always reflects the actual logged-in user.
 *
 * Returns an empty object if userInfo() is unavailable (e.g. uid not present
 * in the password database), in which case we leave identity untouched.
 */
function getIdentityEnv(): Record<string, string> {
  try {
    const info = userInfo();
    const identity: Record<string, string> = {
      USER: info.username,
      LOGNAME: info.username,
      HOME: info.homedir,
    };
    // pw_shell may be empty on some systems; only set SHELL when present.
    if (typeof info.shell === 'string' && info.shell.length > 0) {
      identity.SHELL = info.shell;
    }
    return identity;
  } catch {
    return {};
  }
}

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
    const env = Object.fromEntries(
      Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
    );
    // Overlay authoritative identity — process.env (from launchd) may carry a
    // wrong USER/LOGNAME/HOME when launched from the Dock.
    return { ...env, ...getIdentityEnv() };
  }
  return resolveFromShell(shell);
}

function resolveFromShell(shell: string): Promise<Record<string, string>> {
  const identity = getIdentityEnv();
  return new Promise((resolve) => {
    // Seed the sourcing shell with the correct identity so profile scripts that
    // reference $HOME/$USER (nvm, pyenv, etc.) resolve against the real user.
    const spawnEnv = { TERM: 'dumb', ...identity };
    execFile(shell, ['-ilc', 'env -0'], { encoding: 'utf8', timeout: 10_000, env: spawnEnv }, (err, stdout) => {
      if (err || !stdout) {
        // Even if sourcing fails, return the authoritative identity so callers
        // (and the spawned agent) still get a correct USER/LOGNAME/HOME.
        resolve({ ...identity });
        return;
      }

      const env: Record<string, string> = {};
      for (const entry of stdout.split('\0')) {
        const idx = entry.indexOf('=');
        if (idx > 0) {
          env[entry.slice(0, idx)] = entry.slice(idx + 1);
        }
      }
      // Overlay identity last — a profile script could have clobbered it, and
      // the password-database value is authoritative.
      return resolve({ ...env, ...identity });
    });
  });
}
