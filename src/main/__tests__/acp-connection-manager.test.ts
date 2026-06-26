import { describe, it, expect, vi } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import type * as acp from '@agentclientprotocol/sdk';
import {
  extractConfigOptionIds,
  extractSessionConfig,
  isMethodNotFound,
  setConfigOption,
  validateCwd,
} from '../acp-connection-manager';

type ConfigOptionConnection = Parameters<typeof setConfigOption>[0];

/** Mock connection exposing the three setters setConfigOption may call. */
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

describe('extractSessionConfig', () => {
  it('derives models/modes from configOptions', () => {
    const result = makeResponse({
      configOptions: [
        {
          type: 'select',
          category: 'model',
          id: 'model',
          name: 'Model',
          currentValue: 'gpt-4',
          options: [
            { value: 'gpt-4', name: 'GPT-4' },
            { value: 'gpt-3.5', name: 'GPT-3.5', description: 'Faster' },
          ],
        },
        {
          type: 'select',
          category: 'mode',
          id: 'mode',
          name: 'Mode',
          currentValue: 'code',
          options: [{ value: 'code', name: 'Code' }],
        },
      ] as acp.SessionConfigOption[],
    });

    const { models, modes } = extractSessionConfig(result);
    expect(models).toEqual({
      availableModels: [
        { modelId: 'gpt-4', name: 'GPT-4', description: null },
        { modelId: 'gpt-3.5', name: 'GPT-3.5', description: 'Faster' },
      ],
      currentModelId: 'gpt-4',
    });
    expect(modes).toEqual({
      availableModes: [{ id: 'code', name: 'Code', description: null }],
      currentModeId: 'code',
    });
  });

  it('prefers configOptions over legacy models/modes', () => {
    const result = makeResponse({
      configOptions: [
        {
          type: 'select',
          category: 'model',
          id: 'model',
          name: 'Model',
          currentValue: 'new',
          options: [{ value: 'new', name: 'New' }],
        },
      ] as acp.SessionConfigOption[],
      models: { availableModels: [{ modelId: 'legacy', name: 'Legacy' }], currentModelId: 'legacy' },
    });

    expect(extractSessionConfig(result).models?.currentModelId).toBe('new');
  });

  it('falls back to legacy models/modes when configOptions is absent', () => {
    const result = makeResponse({
      models: { availableModels: [{ modelId: 'm1', name: 'M1' }], currentModelId: 'm1' },
      modes: { availableModes: [{ id: 'fast', name: 'Fast' }], currentModeId: 'fast' },
    });

    const { models, modes } = extractSessionConfig(result);
    expect(models?.currentModelId).toBe('m1');
    expect(modes?.currentModeId).toBe('fast');
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

    expect(extractSessionConfig(result).models?.availableModels).toEqual([
      { modelId: 'a', name: 'A', description: null },
      { modelId: 'b', name: 'B', description: null },
      { modelId: 'c', name: 'C', description: null },
    ]);
  });

  it('returns undefined for both when nothing is provided', () => {
    const { models, modes } = extractSessionConfig(makeResponse({}));
    expect(models).toBeUndefined();
    expect(modes).toBeUndefined();
  });

  it('ignores non-select and non-matching config options', () => {
    const result = makeResponse({
      configOptions: [
        { type: 'boolean', category: 'model', id: 'x', name: 'X', currentValue: true },
      ] as acp.SessionConfigOption[],
    });
    expect(extractSessionConfig(result).models).toBeUndefined();
  });
});

describe('extractConfigOptionIds', () => {
  it('captures the advertised option id per category (id need not equal category)', () => {
    const result = makeResponse({
      configOptions: [
        { type: 'select', category: 'model', id: 'model-selector', name: 'Model', currentValue: 'a', options: [] },
        { type: 'select', category: 'mode', id: 'reasoning-mode', name: 'Mode', currentValue: 'x', options: [] },
      ] as acp.SessionConfigOption[],
    });

    expect(extractConfigOptionIds(result)).toEqual({ model: 'model-selector', mode: 'reasoning-mode' });
  });

  it('returns undefined ids for a legacy agent that advertises no configOptions', () => {
    const result = makeResponse({
      models: { availableModels: [{ modelId: 'm1', name: 'M1' }], currentModelId: 'm1' },
      modes: { availableModes: [{ id: 'fast', name: 'Fast' }], currentModeId: 'fast' },
    });

    expect(extractConfigOptionIds(result)).toEqual({ model: undefined, mode: undefined });
  });
});

describe('setConfigOption', () => {
  it('sets a model via setSessionConfigOption with the given configId; no legacy call', async () => {
    const conn = mockConn();
    await setConfigOption(conn, 'sess-1', 'model', 'model-selector', 'gpt-5');

    expect(conn.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: 'sess-1',
      configId: 'model-selector',
      value: 'gpt-5',
    });
    expect(conn.unstable_setSessionModel).not.toHaveBeenCalled();
  });

  it('sets a mode via setSessionConfigOption with the given configId; no legacy call', async () => {
    const conn = mockConn();
    await setConfigOption(conn, 'sess-1', 'mode', 'mode', 'plan');

    expect(conn.setSessionConfigOption).toHaveBeenCalledWith({ sessionId: 'sess-1', configId: 'mode', value: 'plan' });
    expect(conn.setSessionMode).not.toHaveBeenCalled();
  });

  it('falls back to unstable_setSessionModel for model when generic API is method-not-found', async () => {
    const conn = mockConn({
      setSessionConfigOption: vi.fn().mockRejectedValue({ code: -32601, message: 'Method not found' }),
    });

    await setConfigOption(conn, 'sess-1', 'model', 'model', 'gpt-5');

    expect(conn.unstable_setSessionModel).toHaveBeenCalledWith({ sessionId: 'sess-1', modelId: 'gpt-5' });
  });

  it('falls back to setSessionMode for mode when generic API is method-not-found', async () => {
    const conn = mockConn({
      setSessionConfigOption: vi.fn().mockRejectedValue({ code: -32601, message: 'Method not found' }),
    });

    await setConfigOption(conn, 'sess-1', 'mode', 'mode', 'plan');

    expect(conn.setSessionMode).toHaveBeenCalledWith({ sessionId: 'sess-1', modeId: 'plan' });
  });

  it('surfaces a non method-not-found error without falling back', async () => {
    const conn = mockConn({
      setSessionConfigOption: vi.fn().mockRejectedValue({ code: -32602, message: 'Invalid model' }),
    });

    await expect(setConfigOption(conn, 'sess-1', 'model', 'model', 'bad')).rejects.toMatchObject({
      message: 'Invalid model',
    });
    expect(conn.unstable_setSessionModel).not.toHaveBeenCalled();
  });
});
