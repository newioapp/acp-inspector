/**
 * EnvVarsTab — view and edit environment variables sourced from a shell.
 */
import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, RefreshCw, Loader2, ChevronDown } from 'lucide-react';
import { useInspectorStore } from '../stores/inspector-store';
import { Button, Hint } from './ui';

interface EnvEntry {
  readonly key: string;
  readonly value: string;
}

function shellLabel(path: string): string {
  if (path === 'environment') {
    return 'environment';
  }
  return path.split('/').pop() ?? path;
}

export function EnvVarsTab(): React.JSX.Element {
  const envVars = useInspectorStore((s) => s.envVars);
  const setEnvVars = useInspectorStore((s) => s.setEnvVars);
  const connectionStatus = useInspectorStore((s) => s.connectionStatus);

  const [entries, setEntries] = useState<EnvEntry[]>([]);
  const [importing, setImporting] = useState(false);
  const [shells, setShells] = useState<string[]>([]);
  const [selectedShell, setSelectedShell] = useState('');
  const [shellDropdownOpen, setShellDropdownOpen] = useState(false);

  const disabled = connectionStatus === 'connected' || connectionStatus === 'connecting';

  // Load available shells and persisted selection on mount
  useEffect(() => {
    void Promise.all([window.api.listShells(), window.api.getLastShell()]).then(([available, lastShell]) => {
      setShells(available);
      if (lastShell && available.includes(lastShell)) {
        setSelectedShell(lastShell);
      } else if (available.length > 0) {
        setSelectedShell(available[0]);
      }
    });
  }, []);

  // Sync entries from store
  useEffect(() => {
    setEntries(Object.entries(envVars).map(([key, value]) => ({ key, value })));
  }, [envVars]);

  // Push entries back to store on change
  function commitEntries(updated: EnvEntry[]): void {
    setEntries(updated);
    const record: Record<string, string> = {};
    for (const { key, value } of updated) {
      const trimmed = key.trim();
      if (trimmed) {
        record[trimmed] = value;
      }
    }
    setEnvVars(record);
  }

  const handleSyncShellEnv = useCallback(async () => {
    setImporting(true);
    try {
      const shellEnv = await window.api.getShellEnv(selectedShell);
      const sorted = Object.entries(shellEnv).map(([key, value]) => ({ key, value }));
      setEntries(sorted);
      setEnvVars(shellEnv);
    } finally {
      setImporting(false);
    }
  }, [selectedShell, setEnvVars]);

  const handleAdd = useCallback(() => {
    const updated = [...entries, { key: '', value: '' }];
    setEntries(updated);
  }, [entries]);

  const handleRemove = useCallback(
    (index: number) => {
      commitEntries(entries.filter((_, i) => i !== index));
    },
    [entries],
  );

  const handleChange = useCallback(
    (index: number, field: 'key' | 'value', val: string) => {
      commitEntries(entries.map((e, i) => (i === index ? { ...e, [field]: val } : e)));
    },
    [entries],
  );

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="relative flex items-stretch">
          <button
            className="flex items-center gap-1.5 rounded-l-md border border-input px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-accent disabled:opacity-40"
            disabled={disabled || importing}
            onClick={() => void handleSyncShellEnv()}
          >
            {importing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Sync from {shellLabel(selectedShell)}
          </button>
          {shells.length > 1 && (
            <>
              <button
                className="flex items-center rounded-r-md border border-l-0 border-input px-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent"
                onClick={() => setShellDropdownOpen((o) => !o)}
              >
                <ChevronDown size={12} className={shellDropdownOpen ? 'rotate-180' : ''} />
              </button>
              {shellDropdownOpen && (
                <div className="absolute right-0 top-full z-10 mt-1 min-w-[160px] rounded-md border border-border bg-card py-1 shadow-md">
                  {shells.map((s) => (
                    <button
                      key={s}
                      className={`flex w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent ${
                        s === selectedShell ? 'text-primary font-medium' : 'text-foreground'
                      }`}
                      onClick={() => {
                        setSelectedShell(s);
                        setShellDropdownOpen(false);
                        void window.api.setLastShell(s);
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex-1" />
      </div>

      <Hint className="mx-4 mt-1 mb-2">
        Environment variables are passed to the agent process when you connect. Sync from your login shell to include
        PATH and other variables needed by the agent.
      </Hint>

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {entries.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No environment variables.
            <br />
            Click &quot;Sync from {selectedShell ? shellLabel(selectedShell) : 'Shell'}&quot; to populate from your
            shell, or add manually.
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground px-1">
              <div className="w-[200px] shrink-0">Variable</div>
              <div className="flex-1">Value</div>
              <div className="w-8" />
            </div>
            {entries.map((entry, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className="w-[200px] shrink-0 rounded-md border border-input bg-background px-2 py-1.5 text-xs font-mono text-foreground outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                  placeholder="KEY"
                  value={entry.key}
                  disabled={disabled}
                  onChange={(e) => handleChange(i, 'key', e.target.value)}
                />
                <input
                  className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs font-mono text-foreground outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                  placeholder="value"
                  value={entry.value}
                  disabled={disabled}
                  onChange={(e) => handleChange(i, 'value', e.target.value)}
                />
                <button
                  className="flex h-7 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-destructive disabled:opacity-40"
                  disabled={disabled}
                  onClick={() => handleRemove(i)}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2">
          <Button variant="outline" disabled={disabled} onClick={handleAdd}>
            <Plus size={12} />
            Add Variable
          </Button>
        </div>
      </div>

      {disabled && (
        <div className="px-4 py-3 text-xs text-muted-foreground">Disconnect to edit environment variables.</div>
      )}
    </div>
  );
}
