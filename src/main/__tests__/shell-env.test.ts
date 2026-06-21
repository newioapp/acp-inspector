import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mocks must be declared before importing the module under test.
const userInfoMock = vi.fn<() => { username: string; homedir: string; shell: string }>();
const execFileMock = vi.fn();
const readFileSyncMock = vi.fn<() => string>();

vi.mock('os', () => ({
  userInfo: () => userInfoMock(),
}));

vi.mock('child_process', () => ({
  execFile: (...args: unknown[]) => {
    execFileMock(...args);
  },
}));

vi.mock('fs', () => ({
  readFileSync: () => readFileSyncMock(),
}));

import { getShellEnv, listAvailableShells, ENVIRONMENT_SOURCE } from '../shell-env';

const IDENTITY = { username: 'alice', homedir: '/Users/alice', shell: '/bin/zsh' };

const DELIM = '__ACP_INSPECTOR_SHELL_ENV_DELIMITER__';

/** Wrap an env body in the delimiters the real shell command emits. */
function delimited(body: string): string {
  return `${DELIM}${body}${DELIM}`;
}

/** Drive the execFile mock to invoke its callback with the given stdout. */
function execFileYields(stdout: string | null, err: Error | null = null): void {
  execFileMock.mockImplementation((_shell, _args, _opts, cb: (e: Error | null, out: string) => void) => {
    cb(err, stdout ?? '');
  });
}

describe('getShellEnv identity overlay', () => {
  beforeEach(() => {
    userInfoMock.mockReturnValue(IDENTITY);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    execFileMock.mockReset();
    userInfoMock.mockReset();
  });

  it('overlays authoritative identity over process.env in environment mode', async () => {
    const orig = { ...process.env };
    process.env.USER = 'root';
    process.env.LOGNAME = 'root';

    const env = await getShellEnv(ENVIRONMENT_SOURCE);

    expect(env.USER).toBe('alice');
    expect(env.LOGNAME).toBe('alice');
    expect(env.HOME).toBe('/Users/alice');
    expect(env.SHELL).toBe('/bin/zsh');

    process.env = orig;
  });

  it('overrides a wrong USER emitted by the shell', async () => {
    execFileYields(['USER=root', 'LOGNAME=root', 'PATH=/opt/homebrew/bin'].join('\0'));

    const env = await getShellEnv('/bin/zsh');

    expect(env.USER).toBe('alice');
    expect(env.LOGNAME).toBe('alice');
    expect(env.HOME).toBe('/Users/alice');
    expect(env.PATH).toBe('/opt/homebrew/bin'); // non-identity vars preserved
  });

  it('strips a banner a profile printed before the env output', async () => {
    // .zprofile printed a line to stdout before `env` ran.
    const banner = 'Configuring from .zprofile\n';
    execFileYields(banner + delimited(['PATH=/usr/bin', 'EDITOR=vim'].join('\0')));

    const env = await getShellEnv('/bin/zsh');

    expect(env.PATH).toBe('/usr/bin');
    expect(env.EDITOR).toBe('vim');
    // No junk key built from the banner text.
    expect(Object.keys(env).some((k) => k.includes('Configuring'))).toBe(false);
  });

  it('drops per-process shell bookkeeping variables', async () => {
    execFileYields(delimited(['_=/usr/bin/env', 'PWD=/tmp/source', 'OLDPWD=/', 'SHLVL=2', 'PATH=/usr/bin'].join('\0')));

    const env = await getShellEnv('/bin/zsh');

    expect(env.PATH).toBe('/usr/bin'); // real vars kept
    expect(env._).toBeUndefined();
    expect(env.PWD).toBeUndefined();
    expect(env.OLDPWD).toBeUndefined();
    expect(env.SHLVL).toBeUndefined();
  });

  it('falls back to raw output when delimiters are absent', async () => {
    execFileYields(['PATH=/usr/bin', 'EDITOR=vim'].join('\0'));

    const env = await getShellEnv('/bin/zsh');

    expect(env.PATH).toBe('/usr/bin');
    expect(env.EDITOR).toBe('vim');
  });

  it('seeds the sourcing shell with the correct identity', async () => {
    execFileYields('PATH=/usr/bin');

    await getShellEnv('/bin/zsh');

    const spawnEnv = execFileMock.mock.calls[0][2].env;
    expect(spawnEnv).toMatchObject({ TERM: 'dumb', USER: 'alice', HOME: '/Users/alice' });
  });

  it('still returns identity when shell sourcing fails', async () => {
    execFileYields(null, new Error('boom'));

    const env = await getShellEnv('/bin/zsh');

    expect(env).toEqual({ USER: 'alice', LOGNAME: 'alice', HOME: '/Users/alice', SHELL: '/bin/zsh' });
  });

  it('leaves identity untouched when userInfo throws', async () => {
    userInfoMock.mockImplementation(() => {
      throw new Error('no passwd entry');
    });
    execFileYields('USER=root\0PATH=/usr/bin');

    const env = await getShellEnv('/bin/zsh');

    expect(env.USER).toBe('root'); // no override available
    expect(env.PATH).toBe('/usr/bin');
  });
});

describe('listAvailableShells login-shell ordering', () => {
  // Typical macOS /etc/shells: bash is listed before zsh.
  const ETC_SHELLS = ['# List of acceptable shells', '/bin/bash', '/bin/csh', '/bin/sh', '/bin/zsh', ''].join('\n');

  beforeEach(() => {
    userInfoMock.mockReturnValue(IDENTITY);
    readFileSyncMock.mockReturnValue(ETC_SHELLS);
  });

  afterEach(() => {
    readFileSyncMock.mockReset();
    userInfoMock.mockReset();
  });

  it('puts the login shell first even when /etc/shells lists it later', () => {
    // IDENTITY.shell is /bin/zsh, which /etc/shells lists after /bin/bash.
    expect(listAvailableShells()).toEqual(['/bin/zsh', '/bin/bash']);
  });

  it('keeps /etc/shells order when the login shell is unsupported', () => {
    userInfoMock.mockReturnValue({ ...IDENTITY, shell: '/usr/bin/fish' });
    expect(listAvailableShells()).toEqual(['/bin/bash', '/bin/zsh']);
  });

  it('prepends the login shell when it is not listed in /etc/shells', () => {
    userInfoMock.mockReturnValue({ ...IDENTITY, shell: '/opt/homebrew/bin/bash' });
    expect(listAvailableShells()).toEqual(['/opt/homebrew/bin/bash', '/bin/bash', '/bin/zsh']);
  });

  it('falls back to environment when no supported shell is found', () => {
    readFileSyncMock.mockReturnValue('# none\n/usr/bin/false\n');
    userInfoMock.mockReturnValue({ ...IDENTITY, shell: '/usr/bin/false' });
    expect(listAvailableShells()).toEqual([ENVIRONMENT_SOURCE]);
  });

  it('falls back to the login shell when /etc/shells cannot be read', () => {
    readFileSyncMock.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(listAvailableShells()).toEqual(['/bin/zsh']);
  });
});
