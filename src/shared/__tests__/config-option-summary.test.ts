import { describe, it, expect } from 'vitest';
import type * as acp from '@agentclientprotocol/sdk';
import { summarizeConfigOptions } from '../config-option-summary';

describe('summarizeConfigOptions', () => {
  it('joins each select option as id=currentValue', () => {
    const options = [
      { type: 'select', id: 'mode', name: 'Mode', currentValue: 'plan', options: [] },
      { type: 'select', id: 'model', name: 'Model', currentValue: 'opus', options: [] },
      { type: 'select', id: 'effort', name: 'Effort', currentValue: 'high', options: [] },
    ] as acp.SessionConfigOption[];

    expect(summarizeConfigOptions(options)).toBe('mode=plan, model=opus, effort=high');
  });

  it('omits non-select options', () => {
    const options = [
      { type: 'select', id: 'mode', name: 'Mode', currentValue: 'plan', options: [] },
      { type: 'boolean', id: 'verbose', name: 'Verbose', currentValue: true },
    ] as acp.SessionConfigOption[];

    expect(summarizeConfigOptions(options)).toBe('mode=plan');
  });

  it('returns an empty string when there are no select options', () => {
    expect(summarizeConfigOptions([])).toBe('');
    expect(
      summarizeConfigOptions([
        { type: 'boolean', id: 'verbose', name: 'Verbose', currentValue: true },
      ] as acp.SessionConfigOption[]),
    ).toBe('');
  });
});
