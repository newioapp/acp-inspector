/**
 * Kiro slash commands plugin — handles `_kiro.dev/commands/available` notifications
 * and transforms `/command` user input into `_kiro.dev/commands/execute` requests.
 *
 * One instance per session (managed by the registry).
 */
import type { ExtensionPlugin, ExtensionPluginContext, PromptTransformResult } from './extension-plugin';
import { Logger } from '../logger';

const log = new Logger('KiroSlashCommandsPlugin');

/** A Kiro slash command as received from the agent. */
export interface KiroCommand {
  readonly name: string;
  readonly description: string;
  readonly meta?: {
    readonly optionsMethod?: string;
    readonly inputType?: string;
    readonly hint?: string;
    readonly local?: boolean;
    readonly searchable?: boolean;
  };
}

export class KiroSlashCommandsPlugin implements ExtensionPlugin {
  readonly prefix = '_kiro.dev/commands/available';

  private commands: KiroCommand[] = [];
  private readonly ctx: ExtensionPluginContext;

  constructor(ctx: ExtensionPluginContext) {
    this.ctx = ctx;
  }

  onNotification(_method: string, params: Record<string, unknown>): void {
    const commands = params.commands as KiroCommand[] | undefined;
    if (commands) {
      this.commands = commands;
    }
  }

  async transformPrompt(sessionId: string, text: string): Promise<PromptTransformResult | null> {
    const trimmed = text.trim();
    if (!trimmed.startsWith('/')) {
      return null;
    }

    log.debug('Checking slash command', trimmed, 'available commands:', this.commands.length);

    const spaceIdx = trimmed.indexOf(' ');
    const commandName = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
    const args = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();

    const command = this.commands.find((c) => c.name === commandName);
    if (!command) {
      log.debug('No matching command for', commandName);
      return null;
    }

    // Local commands (e.g., /quit) — handled client-side, don't send anything
    if (command.meta?.local) {
      return { handled: true };
    }

    log.info('Executing command', commandName, 'args:', args);
    try {
      const response = await this.ctx.sendRequest('_kiro.dev/commands/execute', {
        sessionId,
        command: { command: commandName.slice(1), args: {} },
      });
      log.debug('_kiro.dev/commands/execute response', JSON.stringify(response));
      const message = formatCommandResponse(commandName, response);
      return { handled: true, message };
    } catch (err) {
      log.error('_kiro.dev/commands/execute failed', err);
      const message = err instanceof Error ? err.message : 'Command execution failed';
      return { handled: true, message };
    }
    return { handled: true };
  }

  /** Get available commands. */
  getCommands(): KiroCommand[] {
    return this.commands;
  }

  dispose(): void {
    this.commands = [];
  }
}

export function createKiroSlashCommandsPlugin(ctx: ExtensionPluginContext): KiroSlashCommandsPlugin {
  return new KiroSlashCommandsPlugin(ctx);
}

// ---------------------------------------------------------------------------
// Per-command response formatters
// ---------------------------------------------------------------------------

interface ModelInfo {
  readonly id: string;
  readonly description?: string;
}

interface ContextFileItem {
  readonly name: string;
  readonly tokens: number;
  readonly matched: boolean;
  readonly percent: number;
}

interface AgentInfo {
  readonly name: string;
  readonly description?: string;
  readonly source?: string;
}

interface ToolInfo {
  readonly name: string;
  readonly source?: string;
  readonly description?: string;
  readonly status?: string;
}

type ResponseFormatter = (response: Record<string, unknown>) => string | undefined;

const RESPONSE_FORMATTERS: Record<string, ResponseFormatter> = {
  '/model': (response) => {
    const data = response.data as Record<string, unknown> | undefined;
    if (!data) {
      return response.message as string | undefined;
    }
    const models = data.models as ModelInfo[] | undefined;
    const current = data.current as string | undefined;
    if (!models) {
      return response.message as string | undefined;
    }
    return models
      .map((m) => {
        const prefix = m.id === current ? '→' : ' ';
        const desc = m.description ? ` — ${m.description}` : '';
        return `${prefix} ${m.id}${desc}`;
      })
      .join('\n');
  },

  '/context': (response) => {
    const data = response.data as Record<string, unknown> | undefined;
    if (!data) {
      return response.message as string | undefined;
    }
    const breakdown = data.breakdown as Record<string, unknown> | undefined;
    if (!breakdown) {
      return response.message as string | undefined;
    }
    const model = data.model as string | undefined;
    const pct = data.contextUsagePercentage as number | undefined;
    const lines: string[] = [];
    lines.push(`${model ?? 'unknown'} — ${pct !== undefined ? pct.toFixed(1) : '?'}% used`);
    lines.push('');

    const contextFiles = breakdown.contextFiles as
      | { tokens: number; percent: number; items: ContextFileItem[] }
      | undefined;
    if (contextFiles?.items) {
      const matched = contextFiles.items.filter((f) => f.matched);
      if (matched.length > 0) {
        lines.push(`Context files (${contextFiles.tokens} tokens, ${contextFiles.percent.toFixed(1)}%)`);
        for (const f of matched) {
          lines.push(`  ${f.name}  ${f.tokens} tokens  ${f.percent.toFixed(1)}%`);
        }
        lines.push('');
      }
    }

    const sections: [string, string][] = [
      ['tools', 'Tools'],
      ['kiroResponses', 'Kiro responses'],
      ['yourPrompts', 'Your prompts'],
      ['sessionFiles', 'Session files'],
    ];
    for (const [key, label] of sections) {
      const section = breakdown[key] as { tokens: number; percent: number } | undefined;
      if (section && section.tokens > 0) {
        lines.push(`${label}: ${section.tokens} tokens (${section.percent.toFixed(1)}%)`);
      }
    }

    return lines.join('\n');
  },

  '/agent': (response) => {
    const data = response.data as Record<string, unknown> | undefined;
    if (!data) {
      return response.message as string | undefined;
    }
    const agents = data.agents as AgentInfo[] | undefined;
    const current = data.current as string | undefined;
    if (!agents) {
      return response.message as string | undefined;
    }
    return agents
      .map((a) => {
        const prefix = a.name === current ? '→' : ' ';
        const source = a.source ? ` [${a.source}]` : '';
        const desc = a.description ? ` — ${a.description}` : '';
        return `${prefix} ${a.name}${source}${desc}`;
      })
      .join('\n');
  },

  '/tools': (response) => {
    const data = response.data as Record<string, unknown> | undefined;
    if (!data) {
      return response.message as string | undefined;
    }
    const tools = data.tools as ToolInfo[] | undefined;
    const msg = (data.message ?? response.message) as string | undefined;
    if (!tools) {
      return response.message as string | undefined;
    }
    const lines: string[] = [];
    if (msg) {
      lines.push(msg);
      lines.push('');
    }
    for (const t of tools) {
      const status = t.status ? ` (${t.status})` : '';
      const source = t.source ? ` [${t.source}]` : '';
      // First line of description only
      const desc = t.description?.trim().split('\n')[0] ?? '';
      lines.push(`  ${t.name}${source}${status}${desc ? ` — ${desc}` : ''}`);
    }
    return lines.join('\n');
  },

  '/mcp': (response) => {
    const data = response.data as Record<string, unknown> | undefined;
    if (!data) {
      return response.message as string | undefined;
    }
    const servers = data.servers as { name: string; status: string; toolCount: number }[] | undefined;
    const msg = (data.message ?? response.message) as string | undefined;
    if (!servers) {
      return response.message as string | undefined;
    }
    const lines: string[] = [];
    if (msg) {
      lines.push(msg);
      lines.push('');
    }
    for (const s of servers) {
      lines.push(`  ${s.name}  ${s.status}  ${s.toolCount} tools`);
    }
    return lines.join('\n');
  },
};

function formatCommandResponse(commandName: string, response: Record<string, unknown>): string | undefined {
  if (commandName in RESPONSE_FORMATTERS) {
    return RESPONSE_FORMATTERS[commandName](response);
  }
  return response.message as string | undefined;
}
