/**
 * AgentInfoModal — displays agent info, capabilities, and auth methods
 * from the ACP initialize response.
 */
import { useState } from 'react';
import { X, Check, Minus, Copy, Terminal } from 'lucide-react';
import { useInspectorStore } from '../stores/inspector-store';
import { Modal } from './ui';
import type { InitializeResponse } from '../../../shared/types';
import type { AuthMethodTerminal } from '@agentclientprotocol/sdk';

function quoteArg(arg: string): string {
  return /[\s"'$`\\]/.test(arg) ? `'${arg.replace(/'/g, "'\\''")}'` : arg;
}

function buildTerminalCommand(
  command: string,
  connectedArgs: readonly string[],
  methodArgs: readonly string[],
  env: Readonly<Record<string, string>> | undefined,
): string {
  const envPrefix = env
    ? Object.entries(env)
        .map(([k, v]) => `${k}=${quoteArg(v)}`)
        .join(' ')
    : '';
  const parts = [command, ...connectedArgs, ...methodArgs].map(quoteArg);
  return [envPrefix, ...parts].filter((p) => p.length > 0).join(' ');
}

function TerminalAuthCard({
  method,
  command,
  connectedArgs,
}: {
  readonly method: AuthMethodTerminal;
  readonly command: string | null;
  readonly connectedArgs: readonly string[];
}): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  const fullCommand = command
    ? buildTerminalCommand(command, connectedArgs, method.args ?? [], method.env)
    : null;

  async function handleCopy(): Promise<void> {
    if (!fullCommand) return;
    await navigator.clipboard.writeText(fullCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-md bg-muted p-3">
      <div className="flex items-center gap-2">
        <Terminal size={12} className="text-muted-foreground" />
        <div className="text-sm font-medium">{method.name}</div>
        <span className="rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">terminal</span>
      </div>
      {method.description && (
        <div className="mt-0.5 text-xs text-muted-foreground select-text">{method.description}</div>
      )}

      {fullCommand ? (
        <>
          <div className="mt-2 text-xs text-muted-foreground">Run this command in a terminal to authenticate:</div>
          <div className="mt-1 flex items-start gap-1">
            <pre className="flex-1 overflow-x-auto rounded border border-border bg-background p-2 text-xs font-mono select-text">
              {fullCommand}
            </pre>
            <button
              onClick={() => void handleCopy()}
              className="shrink-0 rounded border border-border p-2 text-muted-foreground hover:text-foreground"
              title="Copy command"
            >
              <Copy size={12} />
            </button>
          </div>
          {copied && <div className="mt-1 text-[10px] text-success">Copied</div>}
        </>
      ) : (
        <div className="mt-2 rounded border border-border bg-background p-2 text-xs text-muted-foreground">
          Connect to an agent first to see the terminal command.
        </div>
      )}
    </div>
  );
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
  readonly data: InitializeResponse | null;
  readonly onClose: () => void;
}): React.JSX.Element {
  const agentInfo = data?.agentInfo;
  const capabilities = data?.agentCapabilities;
  const sessionCaps = capabilities?.sessionCapabilities;
  const authMethods = data?.authMethods;
  const connectedCommand = useInspectorStore((s) => s.connectedCommand);
  const connectedArgs = useInspectorStore((s) => s.connectedArgs);

  return (
    <Modal onClose={onClose} className="max-h-[80vh] w-[500px] overflow-y-auto native-scroll rounded-lg border border-border bg-background p-5 shadow-xl select-text">
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
                  <CapBadge key={`prompt-${key}`} label={key} enabled={typeof val === 'boolean' ? val : val !== undefined} />
                ))}
              {capabilities.mcpCapabilities &&
                Object.entries(capabilities.mcpCapabilities).map(([key, val]) => (
                  <CapBadge key={`mcp-${key}`} label={`mcp:${key}`} enabled={typeof val === 'boolean' ? val : val !== undefined} />
                ))}
            </div>
          </div>
        )}

        {/* Auth Methods */}
        {authMethods && authMethods.length > 0 && (
          <div className="mb-4">
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">Authentication Methods</h3>
            <div className="space-y-2">
              {authMethods.map((method) =>
                'type' in method && method.type === 'terminal' ? (
                  <TerminalAuthCard
                    key={method.id}
                    method={method}
                    command={connectedCommand}
                    connectedArgs={connectedArgs}
                  />
                ) : (
                  <div key={method.id} className="rounded-md bg-muted p-3">
                    <div className="text-sm font-medium">{method.name}</div>
                    {method.description && (
                      <div className="mt-0.5 text-xs text-muted-foreground select-text">{method.description}</div>
                    )}
                  </div>
                ),
              )}
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
    </Modal>
  );
}
