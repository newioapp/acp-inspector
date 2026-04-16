/**
 * SlashCommandStore — stores available ACP slash commands per session.
 *
 * Each `available_commands_update` replaces the full command list for that session.
 */
import type { AvailableCommand } from '../shared/types';

export class SlashCommandStore {
  private readonly commands = new Map<string, readonly AvailableCommand[]>();

  set(sessionId: string, commands: readonly AvailableCommand[]): void {
    this.commands.set(sessionId, commands);
  }

  get(sessionId: string): readonly AvailableCommand[] {
    return this.commands.get(sessionId) ?? [];
  }

  clearSession(sessionId: string): void {
    this.commands.delete(sessionId);
  }

  clear(): void {
    this.commands.clear();
  }
}
