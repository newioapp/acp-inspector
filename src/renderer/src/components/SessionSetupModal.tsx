/**
 * SessionSetupModal — configure cwd, MCP servers, then create or load a session.
 */
import { useState } from 'react';
import { X, FolderOpen } from 'lucide-react';
import { useInspectorStore } from '../stores/inspector-store';
import { Button, Input, Label, Textarea } from './ui';
import type { SessionSetupConfig, McpServerConfig } from '../../../shared/types';

type Mode = 'new' | 'load';

const MCP_PLACEHOLDER = `[
  {
    "name": "filesystem",
    "command": "/path/to/mcp-server",
    "args": ["--stdio"],
    "env": [{ "name": "KEY", "value": "val" }]
  }
]`;

export function SessionSetupModal({ onClose }: { readonly onClose: () => void }): React.JSX.Element {
  const supportsLoadSession = useInspectorStore((s) => s.supportsLoadSession);
  const createSession = useInspectorStore((s) => s.createSession);
  const loadSession = useInspectorStore((s) => s.loadSession);

  const [mode, setMode] = useState<Mode>('new');
  const [cwd, setCwd] = useState('');
  const [mcpJson, setMcpJson] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function parseMcpServers(): McpServerConfig[] | null {
    const trimmed = mcpJson.trim();
    if (!trimmed) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) {
        setError('MCP servers must be a JSON array');
        return null;
      }
      return parsed as McpServerConfig[];
    } catch {
      setError('Invalid JSON');
      return null;
    }
  }

  async function handleSubmit(): Promise<void> {
    setError('');
    const mcpServers = parseMcpServers();
    if (mcpServers === null) {
      return;
    }
    if (!cwd.trim()) {
      setError('Working directory is required');
      return;
    }
    if (mode === 'load' && !sessionId.trim()) {
      setError('Session ID is required');
      return;
    }
    if (mode === 'load') {
      const sessions = useInspectorStore.getState().sessions;
      if (sessions.some((s) => s.sessionId === sessionId.trim())) {
        setError('Session is already active');
        return;
      }
    }

    const config: SessionSetupConfig = { cwd: cwd.trim(), mcpServers };
    setLoading(true);
    try {
      if (mode === 'load') {
        await loadSession(sessionId.trim(), config);
      } else {
        await createSession(config);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectCwd(): Promise<void> {
    const dir = await window.api.selectDirectory();
    if (dir) {
      setCwd(dir);
    }
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[520px] rounded-lg border border-border bg-background p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Session Setup</h2>
          <button className="text-muted-foreground hover:text-foreground" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="mb-4 flex gap-1 rounded-md bg-muted p-0.5">
          <button
            className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === 'new' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setMode('new')}
          >
            New Session
          </button>
          <button
            className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === 'load'
                ? 'bg-background text-foreground shadow-sm'
                : supportsLoadSession
                  ? 'text-muted-foreground hover:text-foreground'
                  : 'text-muted-foreground/40 cursor-not-allowed'
            }`}
            onClick={() => {
              if (supportsLoadSession) {
                setMode('load');
              }
            }}
            disabled={!supportsLoadSession}
            title={supportsLoadSession ? undefined : 'Agent does not support loading sessions'}
          >
            Load Session
          </button>
        </div>

        {/* Session ID (load mode only) */}
        {mode === 'load' && (
          <Label text="Session ID" className="mb-3">
            <Input
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="sess_abc123def456"
              className="font-mono text-xs"
            />
          </Label>
        )}

        {/* Working directory */}
        <Label text="Working Directory" className="mb-3">
          <div className="flex gap-1">
            <Input value={cwd} onChange={(e) => setCwd(e.target.value)} placeholder="/path/to/project" />
            <button
              className="flex h-[38px] w-9 shrink-0 items-center justify-center rounded-md border border-input text-muted-foreground hover:text-foreground"
              onClick={() => void handleSelectCwd()}
            >
              <FolderOpen size={14} />
            </button>
          </div>
        </Label>

        {/* MCP servers JSON */}
        <Label text="MCP Servers (JSON, optional)" className="mb-4">
          <Textarea
            value={mcpJson}
            onChange={(e) => setMcpJson(e.target.value)}
            placeholder={MCP_PLACEHOLDER}
            rows={6}
            className="font-mono text-xs"
          />
        </Label>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void handleSubmit()} disabled={loading}>
            {loading ? 'Starting…' : mode === 'load' ? 'Load Session' : 'Create Session'}
          </Button>
        </div>

        {/* Error */}
        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
