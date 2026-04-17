/**
 * AllSessionsModal — paginated view of all sessions.
 */
import { useState, useMemo } from 'react';
import { X, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useInspectorStore } from '../stores/inspector-store';
import { Button } from './ui';
import { Modal } from './ui';

const PAGE_SIZE = 20;

export function AllSessionsModal({ onClose }: { readonly onClose: () => void }): React.JSX.Element {
  const sessions = useInspectorStore((s) => s.sessions);
  const activeSessionId = useInspectorStore((s) => s.activeSessionId);
  const setActiveSession = useInspectorStore((s) => s.setActiveSession);
  const supportsCloseSession = useInspectorStore((s) => s.supportsCloseSession);
  const closeSession = useInspectorStore((s) => s.closeSession);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    const q = filter.toLowerCase().trim();
    if (!q) {
      return sessions;
    }
    return sessions.filter(
      (s) => s.sessionId.toLowerCase().includes(q) || (s.title?.toLowerCase().includes(q) ?? false),
    );
  }, [sessions, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  return (
    <Modal onClose={onClose} className="w-[480px] max-h-[70vh] flex flex-col rounded-lg border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">All Sessions ({String(filtered.length)}{filter ? ` / ${String(sessions.length)}` : ''})</h2>
          <button className="text-muted-foreground hover:text-foreground" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
        <div className="border-b border-border px-4 py-2">
          <div className="flex items-center gap-2 rounded border border-border px-2 py-1">
            <Search size={12} className="shrink-0 text-muted-foreground" />
            <input
              className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
              placeholder="Filter by title or session ID…"
              value={filter}
              onChange={(e) => { setFilter(e.target.value); setPage(0); }}
            />
            {filter && (
              <button className="text-muted-foreground hover:text-foreground" onClick={() => { setFilter(''); setPage(0); }}>
                <X size={10} />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {pageItems.map((s) => (
            <div
              key={s.sessionId}
              className={`flex items-start justify-between rounded-md px-3 py-2 mb-1 cursor-pointer transition-colors ${
                s.sessionId === activeSessionId
                  ? 'bg-primary/15 border border-primary/30'
                  : 'hover:bg-muted border border-transparent'
              }`}
              onClick={() => {
                void setActiveSession(s.sessionId).then(onClose);
              }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-xs font-medium text-foreground">
                    {s.title ?? 'Untitled session'}
                  </span>
                  {!s.loaded && (
                    <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">unloaded</span>
                  )}
                </div>
                <div className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
                  <div className="font-mono truncate" title={s.sessionId}>{s.sessionId}</div>
                  {s.cwd && <div className="truncate" title={s.cwd}>Working directory: {s.cwd}</div>}
                  {s.updatedAt && <div>{new Date(s.updatedAt).toLocaleString()}</div>}
                </div>
              </div>
              {supportsCloseSession && (
                <Button
                  variant="ghost"
                  className="ml-2 shrink-0 px-1 py-0.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    void closeSession(s.sessionId);
                  }}
                >
                  <X size={10} />
                </Button>
              )}
            </div>
          ))}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 border-t border-border px-4 py-2">
            <Button variant="ghost" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} className="px-1.5 py-1">
              <ChevronLeft size={12} />
            </Button>
            <span className="text-xs text-muted-foreground">
              {String(safePage + 1)} / {String(totalPages)}
            </span>
            <Button variant="ghost" disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)} className="px-1.5 py-1">
              <ChevronRight size={12} />
            </Button>
          </div>
        )}
    </Modal>
  );
}
