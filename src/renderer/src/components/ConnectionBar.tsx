/**
 * ConnectionBar — command, cwd, connect/disconnect.
 */
import { useEffect, useState } from 'react';
import { Plug, Unplug, FolderOpen } from 'lucide-react';
import { useInspectorStore } from '../stores/inspector-store';
import { Button, Input, Label } from './ui';

const ROTATING_PLACEHOLDERS = ['kiro-cli acp', 'cursor acp', 'gemini --acp', 'and any ACP-compatible agents'];

function RotatingPlaceholder({ visible }: { readonly visible: boolean }): React.JSX.Element {
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const interval = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setIndex((i) => (i + 1) % ROTATING_PLACEHOLDERS.length);
        setFading(false);
      }, 300);
    }, 3000);

    return () => clearInterval(interval);
  }, [visible]);

  return (
    <span
      className="pointer-events-none text-sm text-muted-foreground/60 transition-opacity duration-300"
      style={{ opacity: fading ? 0 : 1 }}
    >
      {ROTATING_PLACEHOLDERS[index]}
    </span>
  );
}

export function ConnectionBar(): React.JSX.Element {
  const connectionStatus = useInspectorStore((s) => s.connectionStatus);
  const envVars = useInspectorStore((s) => s.envVars);
  const connect = useInspectorStore((s) => s.connect);
  const disconnect = useInspectorStore((s) => s.disconnect);

  const [commandLine, setCommandLine] = useState('');
  const [cwd, setCwd] = useState('');
  const [commandFocused, setCommandFocused] = useState(false);

  useEffect(() => {
    void window.api.getLastConnectionConfig().then((config) => {
      if (config.command) {
        setCommandLine(config.args ? `${config.command} ${config.args}` : config.command);
      }
      if (config.cwd) {
        setCwd(config.cwd);
      }
    });
  }, []);

  const isConnected = connectionStatus === 'connected';
  const isConnecting = connectionStatus === 'connecting';
  const isDisconnecting = connectionStatus === 'disconnecting';

  async function handleConnect(): Promise<void> {
    const parts = commandLine
      .trim()
      .split(/\s+/)
      .filter((a) => a.length > 0);
    const command = parts[0] ?? '';
    const parsedArgs = parts.slice(1);
    await connect({ command, args: parsedArgs, cwd, envVars });
  }

  async function handleSelectCwd(): Promise<void> {
    const dir = await window.api.selectDirectory();
    if (dir) {
      setCwd(dir);
    }
  }

  return (
    <div className="border-b border-border px-4 py-3">
      <div className="flex items-end gap-3">
        <Label text="Command" className="mb-0 flex-[2] min-w-0">
          <div className="relative">
            <Input
              value={commandLine}
              onChange={(e) => setCommandLine(e.target.value)}
              onFocus={() => setCommandFocused(true)}
              onBlur={() => setCommandFocused(false)}
              disabled={isConnected || isConnecting}
            />
            {!commandLine && !commandFocused && !(isConnected || isConnecting) && (
              <div className="pointer-events-none absolute inset-0 flex items-center px-3">
                <RotatingPlaceholder visible={!commandLine && !commandFocused} />
              </div>
            )}
          </div>
        </Label>
        <Label text="Working Directory" className="mb-0 flex-1 min-w-0">
          <div className="flex gap-1">
            <Input
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder="/path/to/project"
              disabled={isConnected || isConnecting}
            />
            <button
              className="flex h-[38px] w-9 shrink-0 items-center justify-center rounded-md border border-input text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => void handleSelectCwd()}
              disabled={isConnected || isConnecting}
            >
              <FolderOpen size={14} />
            </button>
          </div>
        </Label>
        <Label text=" " className="mb-0 shrink-0">
          {isConnected || isDisconnecting ? (
            <Button variant="danger" onClick={() => void disconnect()} className="h-[38px]" disabled={isDisconnecting}>
              <Unplug size={12} />
              {isDisconnecting ? 'Disconnecting…' : 'Disconnect'}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => void handleConnect()}
              disabled={!commandLine.trim() || !cwd.trim() || isConnecting}
              className="h-[38px]"
            >
              <Plug size={12} />
              {isConnecting ? 'Connecting…' : 'Connect'}
            </Button>
          )}
        </Label>
      </div>
    </div>
  );
}
