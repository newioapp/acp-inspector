import type { SessionConfigOption } from '@agentclientprotocol/sdk';

/**
 * Summarize a config_option_update's select options as a compact "id=value, id=value"
 * string for the output log (e.g. "mode=plan, model=opus, effort=high"). Non-select
 * options are omitted.
 */
export function summarizeConfigOptions(configOptions: readonly SessionConfigOption[]): string {
  return configOptions
    .filter((o) => o.type === 'select')
    .map((o) => `${o.id}=${o.currentValue}`)
    .join(', ');
}
