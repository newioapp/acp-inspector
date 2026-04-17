/**
 * PermissionCard — renders a permission request with human-friendly details and action buttons.
 */
import { useState } from 'react';
import { useInspectorStore } from '../stores/inspector-store';
import { Button } from './ui';
import type { InspectorPermissionRequest } from '../../../shared/types';
import { ChevronDown, ChevronRight, FileText, Pencil, Trash2, Play, Search, ArrowRightLeft, Brain, Globe, Shuffle, Wrench } from 'lucide-react';

const KIND_CONFIG: Record<string, { icon: typeof FileText; label: string; color: string }> = {
  read: { icon: FileText, label: 'Read', color: 'text-blue-400' },
  edit: { icon: Pencil, label: 'Edit', color: 'text-yellow-400' },
  delete: { icon: Trash2, label: 'Delete', color: 'text-red-400' },
  execute: { icon: Play, label: 'Execute', color: 'text-orange-400' },
  search: { icon: Search, label: 'Search', color: 'text-purple-400' },
  move: { icon: ArrowRightLeft, label: 'Move', color: 'text-cyan-400' },
  think: { icon: Brain, label: 'Think', color: 'text-indigo-400' },
  fetch: { icon: Globe, label: 'Fetch', color: 'text-green-400' },
  switch_mode: { icon: Shuffle, label: 'Switch Mode', color: 'text-pink-400' },
  other: { icon: Wrench, label: 'Tool', color: 'text-muted-foreground' },
};

function buttonVariant(kind: string, isSelected: boolean): 'success' | 'danger' | 'outline' {
  if (isSelected) {
    return kind.startsWith('reject') ? 'danger' : 'success';
  }
  return 'outline';
}

export function PermissionCard({ request }: { readonly request: InspectorPermissionRequest }): React.JSX.Element {
  const respondPermission = useInspectorStore((s) => s.respondPermission);
  const responded = request.respondedOptionId !== undefined;
  const [showRaw, setShowRaw] = useState(false);

  const data = request.data;
  const options = data.options ?? [];
  const toolCall = data.toolCall;

  const title = toolCall?.title ?? 'Permission Request';
  const kind = toolCall?.kind ?? 'other';
  const kindInfo = KIND_CONFIG[kind] ?? KIND_CONFIG.other;
  const KindIcon = kindInfo.icon;
  const locations = toolCall?.locations ?? [];

  return (
    <div
      className={`my-2 rounded-md border p-3 ${responded ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5'}`}
    >
      {/* Header: icon + title + kind badge */}
      <div className="mb-2 flex items-center gap-2">
        <KindIcon size={14} className={kindInfo.color} />
        <span className={`text-xs font-medium ${responded ? 'text-success' : 'text-warning'}`}>
          {title}
        </span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${kindInfo.color} bg-foreground/5`}>
          {kindInfo.label}
        </span>
        {responded && <span className="text-[10px] text-muted-foreground">— responded</span>}
      </div>

      {/* File locations */}
      {locations.length > 0 && (
        <div className="mb-2 space-y-0.5">
          {locations.map((loc, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
              <FileText size={10} className="shrink-0 opacity-50" />
              <span>{loc.path}{loc.line != null ? `:${String(loc.line)}` : ''}</span>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const isSelected = responded && opt.optionId === request.respondedOptionId;
          return (
            <Button
              key={opt.optionId}
              variant={buttonVariant(opt.kind, isSelected)}
              disabled={responded}
              onClick={() => void respondPermission(request.requestId, opt.optionId)}
            >
              {opt.name}
            </Button>
          );
        })}
      </div>

      {/* Collapsible raw JSON */}
      <button
        type="button"
        className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
        onClick={() => setShowRaw(!showRaw)}
      >
        {showRaw ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        Raw JSON
      </button>
      {showRaw && (
        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-background/50 p-2 text-[10px] text-muted-foreground">
          {JSON.stringify(request.data, null, 2)}
        </pre>
      )}
    </div>
  );
}
