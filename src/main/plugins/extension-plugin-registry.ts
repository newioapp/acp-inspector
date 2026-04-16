/**
 * Extension plugin registry — captures all custom ACP methods (prefixed with `_`),
 * lazily activates plugins per session, and provides prompt transformation.
 */
import type { ClientSideConnection } from '@agentclientprotocol/sdk';
import type {
  ExtensionPlugin,
  ExtensionPluginContext,
  ExtensionPluginFactory,
  PromptTransformResult,
} from './extension-plugin';
import { Logger } from '../logger';

const log = new Logger('ExtensionPluginRegistry');

export class ExtensionPluginRegistry {
  private readonly factories = new Map<string, ExtensionPluginFactory>();
  /** sessionId → (method → plugin) */
  private readonly sessionPlugins = new Map<string, Map<string, ExtensionPlugin>>();
  private connection: ClientSideConnection | null = null;

  /** Register a plugin factory for a method. Plugin is created lazily per session. */
  registerFactory(method: string, factory: ExtensionPluginFactory): void {
    this.factories.set(method, factory);
  }

  /** Set the active connection — plugins use this to send custom requests. */
  setConnection(conn: ClientSideConnection | null): void {
    this.connection = conn;
  }

  /** Route a custom notification from the agent. Activates plugin if needed. */
  handleNotification(method: string, params: Record<string, unknown>): void {
    const sessionId = params.sessionId as string | undefined;
    log.debug('Received notification', method, sessionId ?? '(no session)');
    if (!sessionId) {
      return;
    }
    const plugin = this.getOrActivatePlugin(sessionId, method);
    if (plugin) {
      log.info('Routing notification to plugin', method, sessionId);
      plugin.onNotification(method, params);
    } else {
      log.debug('No plugin registered for notification', method);
    }
  }

  /** Route a custom request from the agent. Activates plugin if needed. */
  async handleRequest(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const sessionId = params.sessionId as string | undefined;
    log.debug('Received request', method, sessionId ?? '(no session)');
    if (!sessionId) {
      return {};
    }
    const plugin = this.getOrActivatePlugin(sessionId, method);
    if (plugin?.onRequest) {
      log.info('Routing request to plugin', method, sessionId);
      return plugin.onRequest(method, params);
    }
    log.debug('No plugin registered for request', method);
    return {};
  }

  /** Forward session update to all active plugins for a session. */
  handleSessionUpdate(sessionId: string, data: unknown): void {
    const plugins = this.sessionPlugins.get(sessionId);
    if (plugins) {
      for (const plugin of plugins.values()) {
        plugin.onSessionUpdate?.(sessionId, data);
      }
    }
  }

  /** Try to transform a prompt via session plugins. Returns null if no plugin handles it. */
  async transformPrompt(sessionId: string, text: string): Promise<PromptTransformResult | null> {
    const plugins = this.sessionPlugins.get(sessionId);
    if (!plugins) {
      return null;
    }
    for (const plugin of plugins.values()) {
      if (plugin.transformPrompt) {
        const result = await plugin.transformPrompt(sessionId, text);
        if (result?.handled) {
          return result;
        }
      }
    }
    return null;
  }

  /** Get an active plugin for a session by method. */
  getPlugin(sessionId: string, method: string): ExtensionPlugin | undefined {
    return this.sessionPlugins.get(sessionId)?.get(method);
  }

  /** Dispose all plugins for a session. */
  disposeSession(sessionId: string): void {
    const plugins = this.sessionPlugins.get(sessionId);
    if (plugins) {
      for (const plugin of plugins.values()) {
        plugin.dispose();
      }
      this.sessionPlugins.delete(sessionId);
    }
  }

  /** Dispose all sessions and reset state. */
  dispose(): void {
    for (const sessionId of this.sessionPlugins.keys()) {
      this.disposeSession(sessionId);
    }
    this.connection = null;
  }

  /** Find matching factory for a method, lazily create the plugin for the session. */
  private getOrActivatePlugin(sessionId: string, method: string): ExtensionPlugin | null {
    let plugins = this.sessionPlugins.get(sessionId);
    if (plugins?.has(method)) {
      return plugins.get(method) ?? null;
    }
    const factory = this.factories.get(method);
    if (!factory) {
      return null;
    }
    log.info('Activating plugin for', method, 'in session', sessionId);
    if (!plugins) {
      plugins = new Map();
      this.sessionPlugins.set(sessionId, plugins);
    }
    const plugin = factory(this.createContext());
    plugins.set(method, plugin);
    return plugin;
  }

  private createContext(): ExtensionPluginContext {
    return {
      sendRequest: (method, params) => {
        if (!this.connection) {
          throw new Error('Not connected');
        }
        return this.connection.extMethod(method, params);
      },
      sendNotification: (method, params) => {
        if (!this.connection) {
          throw new Error('Not connected');
        }
        return this.connection.extNotification(method, params);
      },
    };
  }
}
