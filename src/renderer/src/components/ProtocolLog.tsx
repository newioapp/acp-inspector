/**
 * ProtocolLog — raw JSON-RPC message log with two-tier filtering.
 * Tier 1: filter by method (initialize, session/prompt, session/update, etc.)
 * Tier 2: for session/update, filter by sessionUpdate sub-type
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, Filter } from 'lucide-react';
import { useInspectorStore } from '../stores/inspector-store';
import { Button } from './ui';
import type { ProtocolMessage } from '../../../shared/types';

/** Extract the method from a JSON-RPC message (request, notification, or response). */
function getMethod(msg: ProtocolMessage): string {
  const data = msg.data as Record<string, unknown> | undefined;
  if (typeof data?.method === 'string') {
    return data.method;
  }
  // Responses don't have method — label them
  if (data?.result !== undefined || data?.error !== undefined) {
    return '(response)';
  }
  return '(unknown)';
}

/** For session/update messages, extract the sessionUpdate sub-type. */
function getSessionUpdateType(msg: ProtocolMessage): string | null {
  const data = msg.data as Record<string, unknown> | undefined;
  if (data?.method !== 'session/update') {
    return null;
  }
  const params = data.params as Record<string, unknown> | undefined;
  const update = params?.update as Record<string, unknown> | undefined;
  return (update?.sessionUpdate as string | undefined) ?? null;
}

const SESSION_UPDATE_TYPES = [
  'agent_message_chunk',
  'agent_thought_chunk',
  'user_message_chunk',
  'tool_call',
  'tool_call_update',
  'plan',
  'usage_update',
  'available_commands_update',
  'current_mode_update',
  'config_option_update',
  'session_info_update',
];

export function ProtocolLog(): React.JSX.Element {
  const messages = useInspectorStore((s) => s.protocolMessages);
  const activeSessionId = useInspectorStore((s) => s.activeSessionId);
  const clearProtocolLog = useInspectorStore((s) => s.clearProtocolLog);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hiddenMethods, setHiddenMethods] = useState(new Set());
  const [hiddenSubTypes, setHiddenSubTypes] = useState(new Set());

  // Ctrl+F / Cmd+F to open search
  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    function handleKeyDown(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false);
        setSearchQuery('');
      }
    }
    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [showSearch]);

  // Collect unique methods seen so far
  const seenMethods = useMemo(() => {
    const methods = new Set<string>();
    for (const msg of messages) {
      methods.add(getMethod(msg));
    }
    return [...methods].sort();
  }, [messages]);

  const sessions = useInspectorStore((s) => s.sessions);

  const activeSessionCreatedAt = useMemo(() => {
    if (!activeSessionId) {
      return undefined;
    }
    return sessions.find((s) => s.sessionId === activeSessionId)?.createdAt;
  }, [sessions, activeSessionId]);

  const filtered = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return messages.filter((msg) => {
      // Session filter
      if (activeSessionId) {
        if (msg.sessionId) {
          if (msg.sessionId !== activeSessionId) {
            return false;
          }
        } else if (activeSessionCreatedAt && msg.timestamp >= activeSessionCreatedAt) {
          // No sessionId but arrived after active session was created — hide it
          return false;
        }
      }
      const method = getMethod(msg);
      if (hiddenMethods.has(method)) {
        return false;
      }
      if (method === 'session/update') {
        const subType = getSessionUpdateType(msg);
        if (subType && hiddenSubTypes.has(subType)) {
          return false;
        }
      }
      if (query && !JSON.stringify(msg.data).toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });
  }, [messages, activeSessionId, activeSessionCreatedAt, hiddenMethods, hiddenSubTypes, searchQuery]);

  const prevSessionRef = useRef(activeSessionId);

  useEffect(() => {
    const sessionChanged = prevSessionRef.current !== activeSessionId;
    prevSessionRef.current = activeSessionId;
    bottomRef.current?.scrollIntoView({ behavior: sessionChanged ? 'instant' : 'smooth' });
  }, [filtered.length, activeSessionId]);

  function toggleMethod(method: string): void {
    setHiddenMethods((prev) => {
      const next = new Set(prev);
      if (next.has(method)) {
        next.delete(method);
      } else {
        next.add(method);
      }
      return next;
    });
  }

  function toggleSubType(subType: string): void {
    setHiddenSubTypes((prev) => {
      const next = new Set(prev);
      if (next.has(subType)) {
        next.delete(subType);
      } else {
        next.add(subType);
      }
      return next;
    });
  }

  const hasActiveFilters = hiddenMethods.size > 0 || hiddenSubTypes.size > 0;

  return (
    <div ref={containerRef} className="flex flex-1 flex-col min-h-0" tabIndex={-1}>
      <div className="flex items-center justify-between border-b border-border px-4 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">Protocol Log</span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            onClick={() => setShowFilter((v) => !v)}
            className={`px-1.5 py-0.5 ${hasActiveFilters ? 'text-primary' : ''}`}
          >
            <Filter size={11} />
          </Button>
          <Button variant="ghost" onClick={clearProtocolLog} className="px-1.5 py-0.5">
            <Trash2 size={11} />
          </Button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilter && (
        <div className="border-b border-border px-4 py-2 text-xs">
          <div className="mb-1 font-medium text-muted-foreground">Methods</div>
          <div className="mb-2 flex flex-wrap gap-1">
            {seenMethods.map((method) => (
              <button
                key={method}
                className={`rounded px-1.5 py-0.5 font-mono transition-colors ${
                  hiddenMethods.has(method)
                    ? 'bg-muted text-muted-foreground line-through'
                    : 'bg-primary/15 text-primary'
                }`}
                onClick={() => toggleMethod(method)}
              >
                {method}
              </button>
            ))}
          </div>
          {!hiddenMethods.has('session/update') && (
            <>
              <div className="mb-1 font-medium text-muted-foreground">session/update sub-types</div>
              <div className="flex flex-wrap gap-1">
                {SESSION_UPDATE_TYPES.map((subType) => (
                  <button
                    key={subType}
                    className={`rounded px-1.5 py-0.5 font-mono transition-colors ${
                      hiddenSubTypes.has(subType)
                        ? 'bg-muted text-muted-foreground line-through'
                        : 'bg-primary/15 text-primary'
                    }`}
                    onClick={() => toggleSubType(subType)}
                  >
                    {subType}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Search bar */}
      {showSearch && (
        <div className="flex items-center gap-2 border-b border-border px-4 py-1.5">
          <input
            ref={searchInputRef}
            className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
            placeholder="Search protocol log…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setShowSearch(false);
                setSearchQuery('');
              }
            }}
          />
          <span className="text-xs text-muted-foreground">{filtered.length} matches</span>
          <button
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              setShowSearch(false);
              setSearchQuery('');
            }}
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-2 font-mono text-xs leading-relaxed select-text">
        {filtered.map((msg) => (
          <div key={msg.id} className="mb-1">
            <span className="text-muted-foreground">{new Date(msg.timestamp).toLocaleTimeString()} </span>
            <span className={msg.direction === 'sent' ? 'text-primary' : 'text-success'}>
              {msg.direction === 'sent' ? '→' : '←'}
            </span>{' '}
            <pre className="inline whitespace-pre-wrap break-all text-foreground">
              {JSON.stringify(msg.data, null, 2)}
            </pre>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
