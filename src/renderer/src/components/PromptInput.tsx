/**
 * PromptInput — text area to send prompts to the active session.
 * Shows slash command autocomplete when the user types /.
 * Shows one dropdown per advertised session config option (model, mode, effort, …) below the input.
 */
import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { Send, StopCircle } from 'lucide-react';
import { useInspectorStore } from '../stores/inspector-store';
import { Button } from './ui';
import type { AvailableCommand } from '../../../shared/types';

export function PromptInput(): React.JSX.Element {
  const activeSessionId = useInspectorStore((s) => s.activeSessionId);
  const prompting = useInspectorStore((s) => s.prompting);
  const sendPrompt = useInspectorStore((s) => s.sendPrompt);
  const cancelPrompt = useInspectorStore((s) => s.cancelPrompt);
  const availableCommands = useInspectorStore((s) => s.availableCommands);
  const sessions = useInspectorStore((s) => s.sessions);
  const updateSessionConfigOption = useInspectorStore((s) => s.updateSessionConfigOption);
  const [text, setText] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const commands: readonly AvailableCommand[] = activeSessionId ? (availableCommands[activeSessionId] ?? []) : [];

  const activeSession = useMemo(
    () => sessions.find((s) => s.sessionId === activeSessionId),
    [sessions, activeSessionId],
  );

  // Show autocomplete when input starts with / and we have commands
  const filtered = useMemo(() => {
    const trimmed = text.trimStart();
    if (!trimmed.startsWith('/') || commands.length === 0) {
      return [];
    }
    const query = trimmed.slice(1).toLowerCase();
    if (query.length === 0) {
      return commands;
    }
    return commands.filter((c) => c.name.toLowerCase().includes(query));
  }, [text, commands]);

  const showDropdown = filtered.length > 0;

  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered.length]);

  useEffect(() => {
    if (!showDropdown || !dropdownRef.current) {
      return;
    }
    const item = dropdownRef.current.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, showDropdown]);

  const selectCommand = useCallback((cmd: AvailableCommand) => {
    const hint = cmd.input?.hint ? ' ' : '';
    setText(`/${cmd.name}${hint}`);
    textareaRef.current?.focus();
  }, []);

  const canSend = activeSessionId !== null && text.trim().length > 0;

  function handleSend(): void {
    if (!canSend) {
      return;
    }
    void sendPrompt(text.trim());
    setText('');
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (showDropdown) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        selectCommand(filtered[selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setText('');
        return;
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleConfigChange(configId: string, value: string): void {
    if (!activeSessionId) {
      return;
    }
    updateSessionConfigOption(activeSessionId, configId, value);
    void window.api.setConfigOption(activeSessionId, configId, value);
  }

  return (
    <div className="relative border-t border-border px-4 py-3">
      {/* Slash command autocomplete dropdown */}
      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute bottom-full left-4 right-4 mb-1 max-h-60 overflow-y-auto rounded-md border border-border bg-background shadow-lg"
        >
          {filtered.map((cmd, i) => (
            <button
              key={cmd.name}
              className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-xs ${
                i === selectedIndex ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-muted'
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                selectCommand(cmd);
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="shrink-0 font-mono font-medium text-primary">/{cmd.name}</span>
              <span className="truncate text-muted-foreground">{cmd.description}</span>
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={textareaRef}
        className="w-full resize-none rounded-md bg-background px-3 py-2 text-sm text-foreground outline-none"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={activeSessionId ? 'Type a prompt or a /slash command' : 'Create a session first'}
        disabled={!activeSessionId}
      />

      {/* Bottom row: one dropdown per session config option (model, mode, effort, …) + send/cancel */}
      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        {activeSession?.configOptions.map((opt) => (
          <label
            key={opt.id}
            className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
            title={opt.description}
          >
            <span className="shrink-0">{opt.name}</span>
            <select
              className="min-w-0 max-w-[16rem] truncate rounded border border-input bg-background px-1.5 py-0.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
              value={opt.currentValue}
              onChange={(e) => handleConfigChange(opt.id, e.target.value)}
            >
              {opt.options.map((o) => (
                <option key={o.value} value={o.value} title={o.description ?? undefined}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <Button variant="danger" onClick={() => void cancelPrompt()} disabled={!prompting}>
            <StopCircle size={12} />
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSend} disabled={!canSend}>
            <Send size={12} />
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
