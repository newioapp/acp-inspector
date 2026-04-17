import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExtensionPluginRegistry } from '../plugins/extension-plugin-registry';
import type { ExtensionPlugin } from '../plugins/extension-plugin';

function createMockPlugin(prefix: string): ExtensionPlugin {
  return {
    prefix,
    onNotification: vi.fn(),
    onRequest: vi.fn().mockResolvedValue({ ok: true }),
    onSessionUpdate: vi.fn(),
    transformPrompt: vi.fn().mockResolvedValue(null),
    dispose: vi.fn(),
  };
}

describe('ExtensionPluginRegistry', () => {
  let registry: ExtensionPluginRegistry;
  let mockPlugin: ExtensionPlugin;

  beforeEach(() => {
    registry = new ExtensionPluginRegistry();
    mockPlugin = createMockPlugin('_test/method');
    registry.registerFactory('_test/method', () => mockPlugin);
  });

  describe('handleNotification', () => {
    it('activates plugin and routes notification', () => {
      registry.handleNotification('_test/method', { sessionId: 's1', data: 'hello' });
      expect(mockPlugin.onNotification).toHaveBeenCalledWith('_test/method', { sessionId: 's1', data: 'hello' });
    });

    it('ignores notification without sessionId', () => {
      registry.handleNotification('_test/method', { data: 'hello' });
      expect(mockPlugin.onNotification).not.toHaveBeenCalled();
    });

    it('ignores notification for unregistered method', () => {
      registry.handleNotification('_unknown/method', { sessionId: 's1' });
      expect(mockPlugin.onNotification).not.toHaveBeenCalled();
    });
  });

  describe('handleRequest', () => {
    it('routes request to plugin', async () => {
      const result = await registry.handleRequest('_test/method', { sessionId: 's1' });
      expect(result).toEqual({ ok: true });
    });

    it('returns empty object for unknown method', async () => {
      const result = await registry.handleRequest('_unknown', { sessionId: 's1' });
      expect(result).toEqual({});
    });

    it('returns empty object without sessionId', async () => {
      const result = await registry.handleRequest('_test/method', {});
      expect(result).toEqual({});
    });
  });

  describe('handleSessionUpdate', () => {
    it('forwards update to active plugins', () => {
      // Activate plugin first
      registry.handleNotification('_test/method', { sessionId: 's1' });
      registry.handleSessionUpdate('s1', { some: 'data' });
      expect(mockPlugin.onSessionUpdate).toHaveBeenCalledWith('s1', { some: 'data' });
    });

    it('does nothing for session without plugins', () => {
      registry.handleSessionUpdate('s1', { some: 'data' });
      expect(mockPlugin.onSessionUpdate).not.toHaveBeenCalled();
    });
  });

  describe('transformPrompt', () => {
    it('returns null when no plugins active', async () => {
      const result = await registry.transformPrompt('s1', '/test');
      expect(result).toBeNull();
    });

    it('delegates to active plugin', async () => {
      // Activate plugin
      registry.handleNotification('_test/method', { sessionId: 's1' });
      (mockPlugin.transformPrompt as ReturnType<typeof vi.fn>).mockResolvedValue({ handled: true, message: 'done' });
      const result = await registry.transformPrompt('s1', '/test');
      expect(result).toEqual({ handled: true, message: 'done' });
    });
  });

  describe('dispose', () => {
    it('disposes all session plugins', () => {
      registry.handleNotification('_test/method', { sessionId: 's1' });
      registry.handleNotification('_test/method', { sessionId: 's2' });
      registry.dispose();
      expect(mockPlugin.dispose).toHaveBeenCalled();
    });
  });

  describe('disposeSession', () => {
    it('disposes plugins for a specific session', () => {
      registry.handleNotification('_test/method', { sessionId: 's1' });
      registry.disposeSession('s1');
      expect(mockPlugin.dispose).toHaveBeenCalled();
    });
  });

  describe('getPlugin', () => {
    it('returns undefined for inactive session', () => {
      expect(registry.getPlugin('s1', '_test/method')).toBeUndefined();
    });

    it('returns plugin after activation', () => {
      registry.handleNotification('_test/method', { sessionId: 's1' });
      expect(registry.getPlugin('s1', '_test/method')).toBe(mockPlugin);
    });
  });
});
