/**
 * SessionPanel — create sessions, list sessions, select active session.
 */
import { useState } from 'react';
import { Plus, RefreshCw, X, MoreHorizontal } from 'lucide-react';
import { useInspectorStore } from '../stores/inspector-store';
import { Button } from './ui';
import { SessionSetupModal } from './SessionSetupModal';
import { AllSessionsModal } from './AllSessionsModal';

const MAX_VISIBLE = 5;

export function SessionPanel(): React.JSX.Element {
  const connectionStatus = useInspectorStore((s) => s.connectionStatus);
  const sessions = useInspectorStore((s) => s.sessions);
  const activeSessionId = useInspectorStore((s) => s.activeSessionId);
  const supportsListSessions = useInspectorStore((s) => s.supportsListSessions);
  const supportsCloseSession = useInspectorStore((s) => s.supportsCloseSession);
  const refreshSessions = useInspectorStore((s) => s.refreshSessions);
  const setActiveSession = useInspectorStore((s) => s.setActiveSession);
  const closeSession = useInspectorStore((s) => s.closeSession);
  const [showSetup, setShowSetup] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const isConnected = connectionStatus === 'connected';

  const visibleSessions = (() => {
    const sorted = [...sessions].sort((a, b) => {
      const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return tb - ta;
    });
    const top = sorted.slice(0, MAX_VISIBLE);
    // Ensure active session is always visible
    if (activeSessionId && !top.some((s) => s.sessionId === activeSessionId)) {
      const active = sorted.find((s) => s.sessionId === activeSessionId);
      if (active) {
        top[MAX_VISIBLE - 1] = active;
      }
    }
    return top;
  })();
  const hasMore = sessions.length > MAX_VISIBLE;

  return (
    <>
      <div className="border-b border-border px-4 py-2">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Sessions</span>
          <div className="group relative">
            <Button variant="ghost" disabled={!isConnected} onClick={() => setShowSetup(true)} className="px-1.5 py-1">
              <Plus size={12} />
            </Button>
            {!isConnected && (
              <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-xs text-background group-hover:block">
                Connect to an agent first
              </div>
            )}
          </div>
          <div className="group relative cursor-pointer">
            <Button
              variant="ghost"
              disabled={!isConnected || !supportsListSessions}
              onClick={() => void refreshSessions()}
              className="px-1.5 py-1 pointer-events-auto cursor-pointer"
            >
              <RefreshCw size={12} />
            </Button>
            {!supportsListSessions && (
              <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-xs text-background group-hover:block">
                Agent does not support listing sessions
              </div>
            )}
          </div>
          {hasMore && (
            <button
              className="ml-auto shrink-0 rounded px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              onClick={() => setShowAll(true)}
            >
              <MoreHorizontal size={12} />
              <span>All ({String(sessions.length)})</span>
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {visibleSessions.map((s) => (
            <div
              key={s.sessionId}
              className={`relative rounded-md px-2.5 py-1.5 cursor-pointer transition-colors text-[10px] leading-relaxed ${
                s.sessionId === activeSessionId
                  ? 'bg-primary/15 border border-primary/30'
                  : 'hover:bg-muted border border-transparent'
              }`}
              onClick={() => void setActiveSession(s.sessionId)}
            >
              {supportsCloseSession && (
                <span
                  className={`absolute top-1 right-1 rounded p-0.5 cursor-pointer ${
                    !s.loaded
                      ? 'text-muted-foreground/30 pointer-events-none'
                      : 'text-muted-foreground hover:bg-foreground/10 hover:text-foreground'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (s.loaded) {
                      void closeSession(s.sessionId);
                    }
                  }}
                >
                  <X size={10} />
                </span>
              )}
              <div className="flex items-center gap-1.5 pr-4">
                <span className="truncate text-xs font-medium text-foreground max-w-[140px]">
                  {s.title ?? 'Untitled'}
                </span>
                {!s.loaded && (
                  <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">unloaded</span>
                )}
                {s.updatedAt && <span className="shrink-0 text-muted-foreground">{new Date(s.updatedAt).toLocaleString()}</span>}
              </div>
              {s.cwd && <div className="truncate text-muted-foreground max-w-[200px]" title={s.cwd}>{s.cwd}</div>}
              <div className="font-mono truncate text-muted-foreground max-w-[200px]" title={s.sessionId}>{s.sessionId}</div>
            </div>
          ))}
          {sessions.length === 0 && isConnected && (
            <span className="text-xs text-muted-foreground">No sessions — click + to create one</span>
          )}
        </div>
      </div>
      {showSetup && <SessionSetupModal onClose={() => setShowSetup(false)} />}
      {showAll && <AllSessionsModal onClose={() => setShowAll(false)} />}
    </>
  );
}
