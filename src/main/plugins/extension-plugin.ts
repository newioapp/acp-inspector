/**
 * Extension plugin interface for handling custom ACP methods (prefixed with `_`).
 *
 * Plugins are lazily activated when the registry sees a matching method prefix.
 */

/** Context provided to plugins for sending custom requests/notifications to the agent. */
export interface ExtensionPluginContext {
  sendRequest(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>>;
  sendNotification(method: string, params: Record<string, unknown>): Promise<void>;
}

/** Result of a prompt transformation by a plugin. */
export interface PromptTransformResult {
  /** If true, the plugin handled the prompt — don't send as regular session/prompt. */
  readonly handled: boolean;
  /** Optional message to display in the output panel. */
  readonly message?: string;
}

/** An extension plugin that handles custom ACP methods for a specific prefix. */
export interface ExtensionPlugin {
  /** Method prefix this plugin handles (e.g., "_kiro.dev/"). */
  readonly prefix: string;

  /** Called when a custom notification is received from the agent. */
  onNotification(method: string, params: Record<string, unknown>): void;

  /** Called when a custom request is received from the agent. */
  onRequest?(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>>;

  /** Called on session updates — plugins can observe agent output. */
  onSessionUpdate?(sessionId: string, data: unknown): void;

  /** Transform user input before sending as prompt. Return null to pass through. */
  transformPrompt?(sessionId: string, text: string): Promise<PromptTransformResult | null>;

  /** Clean up when connection is closed. */
  dispose(): void;
}

/** Factory function that creates a plugin instance given a context. */
export type ExtensionPluginFactory = (context: ExtensionPluginContext) => ExtensionPlugin;
