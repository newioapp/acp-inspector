/**
 * AgentInfoModal — displays agent info, capabilities, and auth methods
 * from the ACP initialize response.
 */
import { X, Check, Minus } from 'lucide-react';

interface AgentInfo {
  readonly name?: string;
  readonly title?: string;
  readonly version?: string;
}

interface AuthMethod {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
}

interface Capabilities {
  readonly loadSession?: boolean;
  readonly promptCapabilities?: Record<string, boolean>;
  readonly mcpCapabilities?: Record<string, boolean>;
  readonly sessionCapabilities?: Record<string, unknown>;
}

function CapBadge({ label, enabled }: { readonly label: string; readonly enabled: boolean }): React.JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
        enabled ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'
      }`}
    >
      {enabled ? <Check size={10} /> : <Minus size={10} />}
      {label}
    </span>
  );
}

export function AgentInfoModal({
  data,
  onClose,
}: {
  readonly data: unknown;
  readonly onClose: () => void;
}): React.JSX.Element {
  const raw = data as Record<string, unknown> | undefined;
  const agentInfo = raw?.agentInfo as AgentInfo | undefined;
  const capabilities = raw?.agentCapabilities as Capabilities | undefined;
  const sessionCaps = capabilities?.sessionCapabilities;
  const authMethods = raw?.authMethods as AuthMethod[] | undefined;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[80vh] w-[500px] overflow-y-auto native-scroll rounded-lg border border-border bg-background p-5 shadow-xl select-text">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Agent Information</h2>
          <button className="text-muted-foreground hover:text-foreground" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Agent Info */}
        {agentInfo && (
          <div className="mb-4">
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">Agent</h3>
            <div className="rounded-md bg-muted p-3 text-sm">
              <div className="font-medium">{agentInfo.title ?? agentInfo.name ?? 'Unknown'}</div>
              {agentInfo.version && <div className="mt-0.5 text-xs text-muted-foreground">v{agentInfo.version}</div>}
            </div>
          </div>
        )}

        {/* Capabilities */}
        {capabilities && (
          <div className="mb-4">
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">Capabilities</h3>
            <div className="flex flex-wrap gap-1.5">
              <CapBadge label="loadSession" enabled={capabilities.loadSession === true} />
              <CapBadge label="listSessions" enabled={sessionCaps?.list !== undefined} />
              {capabilities.promptCapabilities &&
                Object.entries(capabilities.promptCapabilities).map(([key, val]) => (
                  <CapBadge key={`prompt-${key}`} label={key} enabled={val} />
                ))}
              {capabilities.mcpCapabilities &&
                Object.entries(capabilities.mcpCapabilities).map(([key, val]) => (
                  <CapBadge key={`mcp-${key}`} label={`mcp:${key}`} enabled={val} />
                ))}
            </div>
          </div>
        )}

        {/* Auth Methods */}
        {authMethods && authMethods.length > 0 && (
          <div className="mb-4">
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">Authentication Methods</h3>
            <div className="space-y-2">
              {authMethods.map((method) => (
                <div key={method.id} className="rounded-md bg-muted p-3">
                  <div className="text-sm font-medium">{method.name}</div>
                  {method.description && (
                    <div className="mt-0.5 text-xs text-muted-foreground select-text">{method.description}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Raw JSON */}
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Raw Response</summary>
          <pre className="mt-2 max-h-[30vh] overflow-auto native-scroll rounded-md bg-muted p-3 text-xs font-mono text-muted-foreground select-text">
            {JSON.stringify(data, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}
