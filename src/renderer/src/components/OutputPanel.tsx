/**
 * OutputPanel — displays session updates (agent messages, tool calls, etc.)
 * and permission requests. Groups contiguous updates of the same type.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Trash2, BarChart3, Shuffle, Cpu } from 'lucide-react';
import { useInspectorStore } from '../stores/inspector-store';
import { Button } from './ui';
import { PermissionCard } from './PermissionCard';
import { ToolCallCard } from './ToolCallCard';
import type { InspectorSessionUpdate, InspectorPermissionRequest } from '../../../shared/types';

interface UpdateGroup {
  readonly type: string;
  readonly timestamp: number;
  readonly items: InspectorSessionUpdate[];
}

const CHUNK_TYPES = new Set(['agent_message_chunk', 'agent_thought_chunk', 'user_message_chunk']);

/** Only these session update types are shown in the output panel. Everything else (e.g. available_commands_update) is silently ignored. */
const OUTPUT_ALLOWLIST = new Set([
  'agent_message_chunk',
  'agent_thought_chunk',
  'user_message_chunk',
  'tool_call',
  'tool_call_update',
  'plan',
  'usage_update',
  'current_mode_update',
  'current_model_update',
]);

function getUpdateType(update: InspectorSessionUpdate): string {
  return update.data.update.sessionUpdate;
}

function getChunkText(update: InspectorSessionUpdate): string {
  const inner = update.data.update;
  if (inner.sessionUpdate === 'agent_message_chunk' || inner.sessionUpdate === 'agent_thought_chunk' || inner.sessionUpdate === 'user_message_chunk') {
    const content = inner.content;
    if (content && 'text' in content) {
      return content.text;
    }
  }
  return '';
}

const TOOL_TYPES = new Set(['tool_call', 'tool_call_update']);

function getToolCallId(update: InspectorSessionUpdate): string | undefined {
  const inner = update.data.update;
  if (inner.sessionUpdate === 'tool_call' || inner.sessionUpdate === 'tool_call_update') {
    return inner.toolCallId;
  }
  return undefined;
}

function groupUpdates(updates: readonly InspectorSessionUpdate[]): UpdateGroup[] {
  const groups: UpdateGroup[] = [];
  // Index of the group for each toolCallId so updates merge into the original tool_call group
  const toolCallGroupIndex = new Map<string, number>();

  for (const update of updates) {
    const type = getUpdateType(update);
    const last = groups.length > 0 ? groups[groups.length - 1] : undefined;

    // Merge tool_call and tool_call_update with the same toolCallId into one group
    if (TOOL_TYPES.has(type)) {
      const tcId = getToolCallId(update);
      if (tcId) {
        const existingIdx = toolCallGroupIndex.get(tcId);
        if (existingIdx !== undefined) {
          groups[existingIdx].items.push(update);
          continue;
        }
        toolCallGroupIndex.set(tcId, groups.length);
      }
      groups.push({ type: 'tool_call', timestamp: update.timestamp, items: [update] });
      continue;
    }

    // Don't concatenate user messages — each one should be its own block
    if (last && last.type === type && type !== 'user_message_chunk') {
      last.items.push(update);
    } else {
      groups.push({ type, timestamp: update.timestamp, items: [update] });
    }
  }
  return groups;
}

const TYPE_LABELS: Record<string, string> = {
  agent_message_chunk: 'Agent Message',
  agent_thought_chunk: 'Agent Thought',
  user_message_chunk: 'User Message',
  tool_call: 'Tool Call',
  tool_call_update: 'Tool Call Update',
  plan: 'Plan',
  usage_update: 'Usage',
};

const TYPE_COLORS: Record<string, string> = {
  agent_message_chunk: 'text-success',
  agent_thought_chunk: 'text-primary',
  user_message_chunk: 'text-foreground',
  tool_call: 'text-warning',
  tool_call_update: 'text-warning',
};

export function OutputPanel(): React.JSX.Element {
  const sessionUpdates = useInspectorStore((s) => s.sessionUpdates);
  const activeSessionId = useInspectorStore((s) => s.activeSessionId);
  const permissionRequests = useInspectorStore((s) => s.permissionRequests);
  const clearOutput = useInspectorStore((s) => s.clearOutput);
  const bottomRef = useRef<HTMLDivElement>(null);

  const sessions = useInspectorStore((s) => s.sessions);

  const activeSessionStartedAt = useMemo(() => {
    if (!activeSessionId) {
      return undefined;
    }
    const updatedAt = sessions.find((s) => s.sessionId === activeSessionId)?.updatedAt;
    return updatedAt ? new Date(updatedAt).getTime() : undefined;
  }, [sessions, activeSessionId]);

  const filteredUpdates = useMemo(
    () =>
      sessionUpdates.filter((u) => {
        const type = getUpdateType(u);
        if (!OUTPUT_ALLOWLIST.has(type)) {
          return false;
        }
        if (!activeSessionId) {
          return true;
        }
        if (u.sessionId) {
          return u.sessionId === activeSessionId;
        }
        // No sessionId — only show if it arrived before active session was created
        return !activeSessionStartedAt || u.timestamp < activeSessionStartedAt;
      }),
    [sessionUpdates, activeSessionId, activeSessionStartedAt],
  );
  const groups = useMemo(() => groupUpdates(filteredUpdates), [filteredUpdates]);

  const filteredPermissions = useMemo(
    () => permissionRequests.filter((req) => !activeSessionId || req.sessionId === activeSessionId),
    [permissionRequests, activeSessionId],
  );

  // Merge groups and permission requests into a single timeline
  type TimelineItem =
    | { readonly kind: 'group'; readonly group: UpdateGroup; readonly timestamp: number }
    | { readonly kind: 'permission'; readonly request: InspectorPermissionRequest; readonly timestamp: number };

  const timeline = useMemo(() => {
    const items: TimelineItem[] = [
      ...groups.map((g) => ({ kind: 'group' as const, group: g, timestamp: g.timestamp })),
      ...filteredPermissions.map((r) => ({ kind: 'permission' as const, request: r, timestamp: r.timestamp })),
    ];
    items.sort((a, b) => a.timestamp - b.timestamp);
    return items;
  }, [groups, filteredPermissions]);

  const prevSessionRef = useRef(activeSessionId);

  useEffect(() => {
    const sessionChanged = prevSessionRef.current !== activeSessionId;
    prevSessionRef.current = activeSessionId;
    bottomRef.current?.scrollIntoView({ behavior: sessionChanged ? 'instant' : 'smooth' });
  }, [timeline.length, activeSessionId]);

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex items-center justify-between border-b border-border px-4 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">Output</span>
        <Button variant="ghost" onClick={clearOutput} className="px-1.5 py-0.5">
          <Trash2 size={11} />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-2 text-xs leading-relaxed select-text">
        {timeline.map((item, i) => {
          if (item.kind === 'permission') {
            return <PermissionCard key={`perm-${item.request.requestId}`} request={item.request} />;
          }

          const { group } = item;
          const label = TYPE_LABELS[group.type] ?? group.type;
          const color = TYPE_COLORS[group.type] ?? 'text-muted-foreground';

          if (CHUNK_TYPES.has(group.type)) {
            const text = group.items.map(getChunkText).join('');
            return (
              <div key={i} className="mb-2">
                <div className="mb-0.5 flex items-center gap-2">
                  <span className="text-muted-foreground">{new Date(group.timestamp).toLocaleTimeString()}</span>
                  <span className={`font-medium ${color}`}>{label}</span>
                </div>
                <pre className="whitespace-pre-wrap break-words font-mono text-foreground">{text}</pre>
              </div>
            );
          }

          if (TOOL_TYPES.has(group.type)) {
            return <ToolCallCard key={i} items={group.items} timestamp={group.timestamp} />;
          }

          if (group.type === 'usage_update') {
            const last = group.items[group.items.length - 1];
            const inner = last.data.update;
            if (inner.sessionUpdate !== 'usage_update') { return null; }
            const used = inner.used;
            const size = inner.size;
            const pct = size > 0 ? Math.round((used / size) * 100) : 0;
            const cost = inner.cost;
            return (
              <div key={i} className="mb-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                <BarChart3 size={11} />
                <span>{new Date(group.timestamp).toLocaleTimeString()}</span>
                <span>Context: {used.toLocaleString()} / {size.toLocaleString()} tokens ({String(pct)}%)</span>
                {cost && <span>· ${cost.amount.toFixed(4)} {cost.currency}</span>}
              </div>
            );
          }

          if (group.type === 'current_mode_update') {
            const inner = group.items[group.items.length - 1].data.update;
            if (inner.sessionUpdate !== 'current_mode_update') { return null; }
            const modeId = inner.currentModeId;
            return (
              <div key={i} className="mb-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                <Shuffle size={11} className="text-pink-400" />
                <span>{new Date(group.timestamp).toLocaleTimeString()}</span>
                <span>Switched agent to <span className="font-medium text-foreground">{modeId}</span></span>
              </div>
            );
          }

          if (group.type === 'current_model_update') {
            // Note: current_model_update is not in the ACP spec's SessionUpdate union.
            // This handles potential future or extension updates.
            return (
              <div key={i} className="mb-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                <Cpu size={11} className="text-cyan-400" />
                <span>{new Date(group.timestamp).toLocaleTimeString()}</span>
                <span>Model updated</span>
              </div>
            );
          }

          return (
            <div key={i} className="mb-2">
              <div className="mb-0.5 flex items-center gap-2">
                <span className="text-muted-foreground">{new Date(group.timestamp).toLocaleTimeString()}</span>
                <span className={`font-medium ${color}`}>{label}</span>
                {group.items.length > 1 && <span className="text-muted-foreground">×{group.items.length}</span>}
              </div>
              <pre className="whitespace-pre-wrap break-all font-mono text-foreground">
                {JSON.stringify(
                  group.items.length === 1 ? group.items[0].data : group.items.map((u) => u.data),
                  null,
                  2,
                )}
              </pre>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
