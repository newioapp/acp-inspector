/**
 * ToolCallCard — renders tool_call and tool_call_update session updates
 * with human-friendly details instead of raw JSON.
 */
import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Pencil,
  Trash2,
  Play,
  Search,
  ArrowRightLeft,
  Brain,
  Globe,
  Shuffle,
  Wrench,
  CheckCircle2,
  Loader2,
  Clock,
  XCircle,
  Terminal,
  FileDiff,
} from 'lucide-react';
import type {
  InspectorSessionUpdate,
  ToolCallContent as AcpToolCallContent,
  ToolCallLocation,
  ToolKind,
  ToolCallStatus,
} from '../../../shared/types';
import type { Diff, Terminal as AcpTerminal, Content } from '@agentclientprotocol/sdk';

// ---------------------------------------------------------------------------
// Merged view model for a tool call group (tool_call + tool_call_updates)
// ---------------------------------------------------------------------------

interface ToolCallViewModel {
  readonly sessionUpdate: string;
  readonly title?: string | null;
  readonly kind?: ToolKind | null;
  readonly toolCallId?: string;
  readonly status?: ToolCallStatus | null;
  readonly locations?: readonly ToolCallLocation[] | null;
  readonly content?: readonly AcpToolCallContent[] | null;
  readonly rawInput?: unknown;
  readonly rawOutput?: unknown;
}

// ---------------------------------------------------------------------------
// Kind → icon/label/color mapping (shared with PermissionCard)
// ---------------------------------------------------------------------------

const KIND_CONFIG: Record<string, { icon: typeof FileText; label: string; color: string }> = {
  read: { icon: FileText, label: 'Read', color: 'text-blue-400' },
  edit: { icon: Pencil, label: 'Edit', color: 'text-yellow-400' },
  delete: { icon: Trash2, label: 'Delete', color: 'text-red-400' },
  execute: { icon: Play, label: 'Execute', color: 'text-orange-400' },
  search: { icon: Search, label: 'Search', color: 'text-purple-400' },
  move: { icon: ArrowRightLeft, label: 'Move', color: 'text-cyan-400' },
  think: { icon: Brain, label: 'Think', color: 'text-indigo-400' },
  fetch: { icon: Globe, label: 'Fetch', color: 'text-green-400' },
  switch_mode: { icon: Shuffle, label: 'Switch', color: 'text-pink-400' },
  other: { icon: Wrench, label: 'Tool', color: 'text-muted-foreground' },
};

const STATUS_CONFIG: Record<string, { icon: typeof Clock; label: string; color: string }> = {
  pending: { icon: Clock, label: 'Pending', color: 'text-muted-foreground' },
  in_progress: { icon: Loader2, label: 'Running', color: 'text-warning' },
  completed: { icon: CheckCircle2, label: 'Done', color: 'text-success' },
  failed: { icon: XCircle, label: 'Failed', color: 'text-destructive' },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LocationList({ locations }: { readonly locations: readonly ToolCallLocation[] }): React.JSX.Element | null {
  if (locations.length === 0) {
    return null;
  }
  return (
    <div className="mt-1.5 space-y-0.5">
      {locations.map((loc, i) => (
        <div key={i} className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
          <FileText size={10} className="shrink-0 opacity-50" />
          <span>
            {loc.path}
            {loc.line !== null && loc.line !== undefined ? `:${String(loc.line)}` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

function DiffView({ diff }: { readonly diff: Diff }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-1.5 rounded border border-border/50 bg-background/50">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
        onClick={() => setExpanded(!expanded)}
      >
        <FileDiff size={10} />
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <span className="font-mono">{diff.path}</span>
      </button>
      {expanded && (
        <pre className="max-h-64 overflow-auto border-t border-border/50 px-2 py-1 font-mono text-[10px] leading-relaxed">
          {diff.oldText !== undefined && diff.oldText !== null && diff.oldText !== '' && (
            <span className="text-red-400/80">
              {diff.oldText
                .split('\n')
                .map((l) => `- ${l}`)
                .join('\n')}
              {'\n'}
            </span>
          )}
          <span className="text-green-400/80">
            {diff.newText
              .split('\n')
              .map((l) => `+ ${l}`)
              .join('\n')}
          </span>
        </pre>
      )}
    </div>
  );
}

function TerminalRef({ content }: { readonly content: AcpTerminal }): React.JSX.Element {
  return (
    <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <Terminal size={10} />
      <span className="font-mono">Terminal {content.terminalId}</span>
    </div>
  );
}

function TextContentView({ content }: { readonly content: Content }): React.JSX.Element | null {
  const block = content.content;
  const text = 'text' in block ? block.text : undefined;
  if (!text) {
    return null;
  }
  return (
    <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-background/50 px-2 py-1 font-mono text-[11px] text-foreground/80">
      {text}
    </pre>
  );
}

function ContentList({ contents }: { readonly contents: readonly AcpToolCallContent[] }): React.JSX.Element | null {
  if (contents.length === 0) {
    return null;
  }
  return (
    <>
      {contents.map((c, i) => {
        if (c.type === 'diff') {
          return <DiffView key={i} diff={c} />;
        }
        if (c.type === 'terminal') {
          return <TerminalRef key={i} content={c} />;
        }
        return <TextContentView key={i} content={c} />;
      })}
    </>
  );
}

function RawInputOutput({ label, data }: { readonly label: string; readonly data: unknown }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return (
    <div className="mt-1.5">
      <button
        type="button"
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {label}
      </button>
      {expanded && (
        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-background/50 p-2 font-mono text-[10px] text-muted-foreground">
          {text}
        </pre>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Renders a group of tool_call / tool_call_update items.
 * The first item is typically the tool_call, subsequent items are updates.
 * We merge them to show the latest state.
 */
export function ToolCallCard({
  items,
  timestamp,
}: {
  readonly items: readonly InspectorSessionUpdate[];
  readonly timestamp: number;
}): React.JSX.Element {
  const [showRaw, setShowRaw] = useState(false);

  // Merge all items — later updates override earlier fields
  const merged = mergeToolCallItems(items);

  const title = merged.title ?? 'Tool Call';
  const kind = merged.kind ?? 'other';
  const kindInfo = KIND_CONFIG[kind] ?? KIND_CONFIG.other;
  const KindIcon = kindInfo.icon;
  const status = merged.status ?? (merged.sessionUpdate === 'tool_call' ? 'in_progress' : undefined);
  const statusInfo = status ? (STATUS_CONFIG[status] ?? undefined) : undefined;
  const StatusIcon = statusInfo?.icon;
  const locations = merged.locations ?? [];
  const contents = merged.content ?? [];

  return (
    <div className="mb-2 rounded-md border border-warning/25 bg-warning/5 p-2">
      {/* Header row */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">{new Date(timestamp).toLocaleTimeString()}</span>
        <KindIcon size={12} className={kindInfo.color} />
        <span className="text-xs font-medium text-warning">{title}</span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${kindInfo.color} bg-foreground/5`}>
          {kindInfo.label}
        </span>
        {statusInfo && StatusIcon && (
          <span className={`flex items-center gap-1 text-[10px] ${statusInfo.color}`}>
            <StatusIcon size={10} className={status === 'in_progress' ? 'animate-spin' : ''} />
            {statusInfo.label}
          </span>
        )}
        {merged.toolCallId && (
          <span className="ml-auto font-mono text-[9px] text-muted-foreground/50">{merged.toolCallId}</span>
        )}
      </div>

      {/* Locations */}
      <LocationList locations={locations} />

      {/* Content (diffs, terminal refs, text) */}
      <ContentList contents={contents} />

      {/* Raw input/output toggles */}
      {merged.rawInput !== undefined && merged.rawInput !== null && (
        <RawInputOutput label="Raw Input" data={merged.rawInput} />
      )}
      {merged.rawOutput !== undefined && merged.rawOutput !== null && (
        <RawInputOutput label="Raw Output" data={merged.rawOutput} />
      )}

      {/* Full raw JSON toggle */}
      <button
        type="button"
        className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
        onClick={() => setShowRaw(!showRaw)}
      >
        {showRaw ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        Raw JSON {items.length > 1 ? `(${String(items.length)} messages)` : ''}
      </button>
      {showRaw && (
        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-background/50 p-2 font-mono text-[10px] text-muted-foreground">
          {JSON.stringify(items.length === 1 ? items[0].data : items.map((u) => u.data), null, 2)}
        </pre>
      )}
    </div>
  );
}

/** Merge a sequence of tool_call + tool_call_update items into one view model. */
function mergeToolCallItems(items: readonly InspectorSessionUpdate[]): ToolCallViewModel {
  let merged: ToolCallViewModel = { sessionUpdate: 'tool_call' };
  for (const item of items) {
    const update = item.data.update;
    merged = {
      ...merged,
      ...stripUndefined(update),
    };
  }
  return merged;
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null) {
      result[k] = v;
    }
  }
  return result;
}
