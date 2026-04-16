/**
 * SessionPanel — create sessions, list sessions, select active session.
 */
import { useState } from 'react';
import { Plus, RefreshCw, X } from 'lucide-react';
import { useInspectorStore } from '../stores/inspector-store';
import { Button } from './ui';
import { SessionSetupModal } from './SessionSetupModal';

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

  const isConnected = connectionStatus === 'connected';

  return (
    <>
      <div className="border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
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
          <div className="flex flex-1 flex-wrap gap-1">
            {sessions.map((s) => (
              <button
                key={s.sessionId}
                className={`group/tab shrink-0 rounded bg-muted px-2 py-1 text-xs font-mono text-foreground select-text transition-colors ${
                  s.sessionId === activeSessionId ? 'bg-primary/20 text-primary' : 'opacity-60 hover:opacity-100'
                }`}
                onClick={() => setActiveSession(s.sessionId)}
              >
                {s.sessionId}
                {supportsCloseSession && (
                  <span
                    className="ml-1 hidden rounded p-0.5 hover:bg-foreground/10 group-hover/tab:inline-flex"
                    onClick={(e) => {
                      e.stopPropagation();
                      void closeSession(s.sessionId);
                    }}
                  >
                    <X size={10} />
                  </span>
                )}
              </button>
            ))}
            {sessions.length === 0 && isConnected && (
              <span className="text-xs text-muted-foreground">No sessions — click + to create one</span>
            )}
          </div>
        </div>
      </div>
      {showSetup && <SessionSetupModal onClose={() => setShowSetup(false)} />}
    </>
  );
}
