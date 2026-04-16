/**
 * ACP Inspector — two-tab layout.
 *
 * Tab 1 (Inspector): connection bar, session panel, output + protocol log, prompt input
 * Tab 2 (Environment): env vars synced from shell
 * Settings overlay via gear icon
 */
import { useEffect, useState } from 'react';
import { Settings, Info, X } from 'lucide-react';
import { useInspectorStore } from './stores/inspector-store';
import { ConnectionBar } from './components/ConnectionBar';
import { SessionPanel } from './components/SessionPanel';
import { OutputPanel } from './components/OutputPanel';
import { ProtocolLog } from './components/ProtocolLog';
import { PromptInput } from './components/PromptInput';
import { EnvVarsTab } from './components/EnvVarsTab';
import { SettingsPanel } from './components/SettingsPanel';
import { AgentInfoModal } from './components/AgentInfoModal';

type Tab = 'inspector' | 'environment';

export function App(): React.JSX.Element {
  const setConnectionStatus = useInspectorStore((s) => s.setConnectionStatus);
  const addProtocolMessage = useInspectorStore((s) => s.addProtocolMessage);
  const addSessionUpdate = useInspectorStore((s) => s.addSessionUpdate);
  const addPermissionRequest = useInspectorStore((s) => s.addPermissionRequest);
  const setEnvVars = useInspectorStore((s) => s.setEnvVars);
  const setPrompting = useInspectorStore((s) => s.setPrompting);
  const setAvailableCommands = useInspectorStore((s) => s.setAvailableCommands);
  const updateSessionMode = useInspectorStore((s) => s.updateSessionMode);
  const updateSessionModel = useInspectorStore((s) => s.updateSessionModel);
  const connectionStatus = useInspectorStore((s) => s.connectionStatus);
  const connectionError = useInspectorStore((s) => s.connectionError);
  const connectionPid = useInspectorStore((s) => s.connectionPid);
  const connectionErrorStack = useInspectorStore((s) => s.connectionErrorStack);
  const agentInfo = useInspectorStore((s) => s.agentInfo);
  const [activeTab, setActiveTab] = useState<Tab>('inspector');
  const [showSettings, setShowSettings] = useState(false);
  const [showErrorDetail, setShowErrorDetail] = useState(false);
  const [showAgentInfo, setShowAgentInfo] = useState(false);
  const [protocolWidth, setProtocolWidth] = useState(400);

  // Draggable divider between output and protocol log
  function handleDividerMouseDown(e: React.MouseEvent): void {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = protocolWidth;
    function onMouseMove(ev: MouseEvent): void {
      setProtocolWidth(Math.max(200, Math.min(800, startWidth + (ev.clientX - startX))));
    }
    function onMouseUp(): void {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  // Hydrate from main-process state on mount, fall back to shell env on first launch
  const hydrate = useInspectorStore((s) => s.hydrate);
  useEffect(() => {
    void window.api.getInspectorState().then((snapshot) => {
      hydrate(snapshot);
      // First launch — no env vars yet, source from shell
      if (Object.keys(snapshot.envVars).length === 0) {
        void Promise.all([window.api.listShells(), window.api.getLastShell()]).then(([shells, lastShell]) => {
          const shell = lastShell && shells.includes(lastShell) ? lastShell : shells[0];
          if (shell) {
            void window.api.getShellEnv(shell).then(setEnvVars);
          }
        });
      }
    });
  }, [hydrate, setEnvVars]);

  useEffect(() => {
    const unsub1 = window.api.onConnectionStatus(({ status, error, pid, errorStack }) => {
      setConnectionStatus(status, error, pid, errorStack);
      if (status === 'error' && errorStack) {
        setShowErrorDetail(true);
      }
    });
    const unsub2 = window.api.onProtocolMessage((msg) => {
      addProtocolMessage(msg);
    });
    const unsub3 = window.api.onSessionUpdate((update) => {
      addSessionUpdate(update);
    });
    const unsub4 = window.api.onPermissionRequest((req) => {
      addPermissionRequest(req);
    });
    const unsub5 = window.api.onPromptDone(() => {
      setPrompting(false);
    });
    const unsub6 = window.api.onAvailableCommands(({ sessionId, commands }) => {
      setAvailableCommands(sessionId, commands);
    });
    const unsub7 = window.api.onModeChanged(({ sessionId, modeId }) => {
      updateSessionMode(sessionId, modeId);
    });
    const unsub8 = window.api.onModelChanged(({ sessionId, modelId }) => {
      updateSessionModel(sessionId, modelId);
    });
    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
      unsub5();
      unsub6();
      unsub7();
      unsub8();
    };
  }, [
    setConnectionStatus,
    addProtocolMessage,
    addSessionUpdate,
    addPermissionRequest,
    setPrompting,
    setAvailableCommands,
    updateSessionMode,
    updateSessionModel,
  ]);

  const statusColor =
    connectionStatus === 'connected'
      ? 'text-success'
      : connectionStatus === 'error'
        ? 'text-destructive'
        : connectionStatus === 'connecting'
          ? 'text-warning'
          : connectionStatus === 'disconnecting'
            ? 'text-warning'
            : 'text-muted-foreground';

  let statusText = connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1);
  if (connectionStatus === 'connected' && connectionPid) {
    statusText = `Connected (pid ${String(connectionPid)})`;
  }

  return (
    <div className="relative flex h-screen w-screen flex-col bg-background text-foreground">
      {/* Top bar: tabs + status + settings */}
      <div className="flex shrink-0 items-center border-b border-border px-4">
        <div className="flex">
          <button
            className={`px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === 'inspector'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('inspector')}
          >
            Inspector
          </button>
          <button
            className={`px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === 'environment'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('environment')}
          >
            Environment
          </button>
        </div>
        <div className="flex-1" />
        <span className={`mr-3 text-xs ${statusColor}`}>
          ● {statusText}
          {connectionStatus === 'connected' && agentInfo !== null && (
            <button
              className="ml-1 inline-flex align-middle text-muted-foreground hover:text-foreground"
              onClick={() => setShowAgentInfo(true)}
            >
              <Info size={12} />
            </button>
          )}
          {connectionStatus === 'error' && (
            <>
              {' — '}
              <button
                className="underline decoration-dotted hover:decoration-solid"
                onClick={() => setShowErrorDetail(true)}
              >
                View Details
              </button>
            </>
          )}
        </span>
        <button className="text-muted-foreground hover:text-foreground" onClick={() => setShowSettings(true)}>
          <Settings size={14} />
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'inspector' ? (
        <>
          <ConnectionBar />
          <SessionPanel />
          <div className="flex flex-1 min-h-0">
            <div className="flex shrink-0 flex-col" style={{ width: protocolWidth }}>
              <ProtocolLog />
            </div>
            <div
              className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-primary/50 active:bg-primary/50"
              onMouseDown={handleDividerMouseDown}
            />
            <div className="flex flex-1 flex-col">
              <OutputPanel />
              <PromptInput />
            </div>
          </div>
        </>
      ) : (
        <EnvVarsTab />
      )}

      {/* Settings overlay */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      {/* Agent info modal */}
      {showAgentInfo && agentInfo !== null && (
        <AgentInfoModal data={agentInfo} onClose={() => setShowAgentInfo(false)} />
      )}

      {/* Error detail modal */}
      {showErrorDetail && connectionError && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="max-h-[80vh] w-[600px] rounded-lg border border-border bg-background p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-destructive">Connection Error</h2>
              <button className="text-muted-foreground hover:text-foreground" onClick={() => setShowErrorDetail(false)}>
                <X size={16} />
              </button>
            </div>
            <p className="mb-3 text-sm text-foreground select-text">{connectionError}</p>
            {connectionErrorStack && (
              <pre className="native-scroll max-h-[50vh] overflow-auto rounded-md bg-muted p-3 text-xs font-mono text-muted-foreground select-text">
                {connectionErrorStack}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
