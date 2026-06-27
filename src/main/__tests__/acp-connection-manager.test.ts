import { describe, it, expect, vi } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import type * as acp from '@agentclientprotocol/sdk';
import { applyConfigOption, extractConfigOptions, isMethodNotFound, validateCwd } from '../acp-connection-manager';

type ConfigOptionConnection = Parameters<typeof applyConfigOption>[0];

/** Mock connection exposing the three setters applyConfigOption may call. */
function mockConn(overrides: Partial<Record<keyof ConfigOptionConnection, unknown>> = {}): ConfigOptionConnection {
  return {
    setSessionConfigOption: vi.fn().mockResolvedValue(undefined),
    setSessionMode: vi.fn().mockResolvedValue(undefined),
    unstable_setSessionModel: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ConfigOptionConnection;
}

/** Build a minimal NewSessionResponse with the given config-bearing fields. */
function makeResponse(overrides: Partial<acp.NewSessionResponse>): acp.NewSessionResponse {
  return { sessionId: 'sess-1', configOptions: null, models: null, modes: null, ...overrides };
}

describe('isMethodNotFound', () => {
  it('is true for JSON-RPC -32601 errors', () => {
    expect(isMethodNotFound({ code: -32601, message: 'Method not found' })).toBe(true);
  });

  it('is false for other error codes and shapes', () => {
    expect(isMethodNotFound({ code: -32602 })).toBe(false);
    expect(isMethodNotFound(new Error('boom'))).toBe(false);
    expect(isMethodNotFound('nope')).toBe(false);
    expect(isMethodNotFound(null)).toBe(false);
    expect(isMethodNotFound(undefined)).toBe(false);
  });
});

describe('validateCwd', () => {
  it('returns null when cwd is empty or undefined (falls back to process cwd)', async () => {
    expect(await validateCwd(undefined)).toBeNull();
    expect(await validateCwd('')).toBeNull();
  });

  it('returns null for an existing directory', async () => {
    expect(await validateCwd(os.tmpdir())).toBeNull();
  });

  it('returns a clear error for a non-existent directory', async () => {
    const missing = path.join(os.tmpdir(), 'acp-inspector-does-not-exist-xyz');
    const err = await validateCwd(missing);
    expect(err).toBe(`Working directory does not exist: "${missing}".`);
  });

  it('returns an error when cwd points to a file, not a directory', async () => {
    // A file that reliably exists on POSIX systems.
    const err = await validateCwd('/etc/hosts');
    expect(err).toBe('Working directory is not a directory: "/etc/hosts".');
  });
});

describe('extractConfigOptions', () => {
  it('returns every select config option generically, preserving order and ids', () => {
    const result = makeResponse({
      configOptions: [
        {
          type: 'select',
          category: 'mode',
          id: 'mode',
          name: 'Mode',
          currentValue: 'plan',
          options: [
            { value: 'plan', name: 'Plan' },
            { value: 'code', name: 'Code' },
          ],
        },
        {
          type: 'select',
          category: 'model',
          id: 'model',
          name: 'Model',
          currentValue: 'opus',
          options: [{ value: 'opus', name: 'Opus', description: 'Best' }],
        },
        {
          // A new dimension (effort) renders with no inspector code referencing it. Note its
          // category ('thought_level') differs from its id ('effort'); the id is what matters.
          type: 'select',
          category: 'thought_level',
          id: 'effort',
          name: 'Effort',
          currentValue: 'high',
          options: [
            { value: 'low', name: 'Low' },
            { value: 'high', name: 'High' },
          ],
        },
      ] as acp.SessionConfigOption[],
    });

    expect(extractConfigOptions(result)).toEqual([
      {
        id: 'mode',
        name: 'Mode',
        description: undefined,
        category: 'mode',
        currentValue: 'plan',
        options: [
          { value: 'plan', name: 'Plan', description: undefined },
          { value: 'code', name: 'Code', description: undefined },
        ],
      },
      {
        id: 'model',
        name: 'Model',
        description: undefined,
        category: 'model',
        currentValue: 'opus',
        options: [{ value: 'opus', name: 'Opus', description: 'Best' }],
      },
      {
        id: 'effort',
        name: 'Effort',
        description: undefined,
        category: 'thought_level',
        currentValue: 'high',
        options: [
          { value: 'low', name: 'Low', description: undefined },
          { value: 'high', name: 'High', description: undefined },
        ],
      },
    ]);
  });

  it('flattens grouped select options', () => {
    const result = makeResponse({
      configOptions: [
        {
          type: 'select',
          category: 'model',
          id: 'model',
          name: 'Model',
          currentValue: 'a',
          options: [
            {
              group: 'g1',
              name: 'Group 1',
              options: [
                { value: 'a', name: 'A' },
                { value: 'b', name: 'B' },
              ],
            },
            { group: 'g2', name: 'Group 2', options: [{ value: 'c', name: 'C' }] },
          ],
        },
      ] as acp.SessionConfigOption[],
    });

    expect(extractConfigOptions(result)[0].options).toEqual([
      { value: 'a', name: 'A', description: undefined },
      { value: 'b', name: 'B', description: undefined },
      { value: 'c', name: 'C', description: undefined },
    ]);
  });

  it('skips non-select config options', () => {
    const result = makeResponse({
      configOptions: [
        { type: 'boolean', category: 'model', id: 'x', name: 'X', currentValue: true },
      ] as acp.SessionConfigOption[],
    });
    expect(extractConfigOptions(result)).toEqual([]);
  });

  it('synthesizes generic mode/model options (ids "mode"/"model") from legacy fields', () => {
    const result = makeResponse({
      models: { availableModels: [{ modelId: 'm1', name: 'M1', description: 'desc' }], currentModelId: 'm1' },
      modes: { availableModes: [{ id: 'fast', name: 'Fast' }], currentModeId: 'fast' },
    });

    expect(extractConfigOptions(result)).toEqual([
      {
        id: 'mode',
        name: 'Mode',
        currentValue: 'fast',
        options: [{ value: 'fast', name: 'Fast', description: undefined }],
      },
      {
        id: 'model',
        name: 'Model',
        currentValue: 'm1',
        options: [{ value: 'm1', name: 'M1', description: 'desc' }],
      },
    ]);
  });

  it('prefers configOptions over the legacy fields', () => {
    const result = makeResponse({
      configOptions: [
        { type: 'select', category: 'model', id: 'model', name: 'Model', currentValue: 'new', options: [] },
      ] as acp.SessionConfigOption[],
      models: { availableModels: [{ modelId: 'legacy', name: 'Legacy' }], currentModelId: 'legacy' },
    });

    const options = extractConfigOptions(result);
    expect(options).toHaveLength(1);
    expect(options[0].currentValue).toBe('new');
  });

  it('returns an empty list when nothing is advertised', () => {
    expect(extractConfigOptions(makeResponse({}))).toEqual([]);
  });
});

describe('applyConfigOption', () => {
  it('sets any dimension via setSessionConfigOption with its configId; no legacy call', async () => {
    const conn = mockConn();
    await applyConfigOption(conn, 'sess-1', 'effort', 'high');

    expect(conn.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: 'sess-1',
      configId: 'effort',
      value: 'high',
    });
    expect(conn.setSessionMode).not.toHaveBeenCalled();
    expect(conn.unstable_setSessionModel).not.toHaveBeenCalled();
  });

  it('falls back to unstable_setSessionModel for configId "model" on method-not-found', async () => {
    const conn = mockConn({
      setSessionConfigOption: vi.fn().mockRejectedValue({ code: -32601, message: 'Method not found' }),
    });

    await applyConfigOption(conn, 'sess-1', 'model', 'gpt-5');

    expect(conn.unstable_setSessionModel).toHaveBeenCalledWith({ sessionId: 'sess-1', modelId: 'gpt-5' });
  });

  it('falls back to setSessionMode for configId "mode" on method-not-found', async () => {
    const conn = mockConn({
      setSessionConfigOption: vi.fn().mockRejectedValue({ code: -32601, message: 'Method not found' }),
    });

    await applyConfigOption(conn, 'sess-1', 'mode', 'plan');

    expect(conn.setSessionMode).toHaveBeenCalledWith({ sessionId: 'sess-1', modeId: 'plan' });
  });

  it('has no legacy fallback for other dimensions: rethrows method-not-found for "effort"', async () => {
    const conn = mockConn({
      setSessionConfigOption: vi.fn().mockRejectedValue({ code: -32601, message: 'Method not found' }),
    });

    await expect(applyConfigOption(conn, 'sess-1', 'effort', 'high')).rejects.toMatchObject({ code: -32601 });
    expect(conn.setSessionMode).not.toHaveBeenCalled();
    expect(conn.unstable_setSessionModel).not.toHaveBeenCalled();
  });

  it('surfaces a non method-not-found error without falling back', async () => {
    const conn = mockConn({
      setSessionConfigOption: vi.fn().mockRejectedValue({ code: -32602, message: 'Invalid model' }),
    });

    await expect(applyConfigOption(conn, 'sess-1', 'model', 'bad')).rejects.toMatchObject({ message: 'Invalid model' });
    expect(conn.unstable_setSessionModel).not.toHaveBeenCalled();
  });
});
