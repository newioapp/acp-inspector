import { describe, it, expect, beforeEach } from 'vitest';
import { MainInspectorState } from '../main-state';

describe('MainInspectorState', () => {
  let state: MainInspectorState;

  beforeEach(() => {
    state = new MainInspectorState();
  });

  describe('snapshot', () => {
    it('returns default state', () => {
      const snap = state.snapshot();
      expect(snap.connectionStatus).toBe('disconnected');
      expect(snap.agentInfo).toBeNull();
      expect(snap.sessions).toEqual([]);
      expect(snap.activeSessionId).toBeNull();
      expect(snap.prompting).toBe(false);
    });

    it('caps sessionUpdates to 500', () => {
      for (let i = 0; i < 600; i++) {
        state.sessionUpdates.push({
          timestamp: i,
          sessionId: 's1',
          data: {
            sessionId: 's1',
            update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: `${i}` } },
          },
        } as any);
      }
      const snap = state.snapshot();
      expect(snap.sessionUpdates).toHaveLength(500);
      expect((snap.sessionUpdates[0] as any).timestamp).toBe(100);
    });

    it('caps protocolMessages to 500', () => {
      for (let i = 0; i < 600; i++) {
        state.protocolMessages.push({ id: i, timestamp: i, direction: 'sent', data: { method: 'test' } } as any);
      }
      const snap = state.snapshot();
      expect(snap.protocolMessages).toHaveLength(500);
    });
  });

  describe('updateSessionMode', () => {
    it('updates mode for matching session with modes', () => {
      state.sessions = [{ sessionId: 's1', modes: { currentModeId: 'old', availableModes: [] } }];
      state.updateSessionMode('s1', 'new');
      expect(state.sessions[0].modes?.currentModeId).toBe('new');
    });

    it('does not update session without modes', () => {
      state.sessions = [{ sessionId: 's1' }];
      state.updateSessionMode('s1', 'new');
      expect(state.sessions[0].modes).toBeUndefined();
    });

    it('does not update non-matching session', () => {
      state.sessions = [{ sessionId: 's1', modes: { currentModeId: 'old', availableModes: [] } }];
      state.updateSessionMode('s2', 'new');
      expect(state.sessions[0].modes?.currentModeId).toBe('old');
    });
  });

  describe('updateSessionModel', () => {
    it('updates model for matching session with models', () => {
      state.sessions = [{ sessionId: 's1', models: { currentModelId: 'old', availableModels: [] } }];
      state.updateSessionModel('s1', 'new');
      expect(state.sessions[0].models?.currentModelId).toBe('new');
    });
  });

  describe('clearOutput', () => {
    it('clears updates and permissions for given session', () => {
      state.sessionUpdates = [
        { timestamp: 1, sessionId: 's1', data: {} as any },
        { timestamp: 2, sessionId: 's2', data: {} as any },
      ];
      state.permissionRequests = [
        { requestId: 'r1', timestamp: 1, sessionId: 's1', data: {} as any },
        { requestId: 'r2', timestamp: 2, sessionId: 's2', data: {} as any },
      ];
      state.clearOutput('s1');
      expect(state.sessionUpdates).toHaveLength(1);
      expect(state.sessionUpdates[0].sessionId).toBe('s2');
      expect(state.permissionRequests).toHaveLength(1);
      expect(state.permissionRequests[0].sessionId).toBe('s2');
    });

    it('is a no-op when sessionId is null (sessionUpdates always have a sessionId)', () => {
      state.sessionUpdates = [{ timestamp: 1, sessionId: 's1', data: {} as any }];
      state.permissionRequests = [{ requestId: 'r1', timestamp: 1, sessionId: 's1', data: {} as any }];
      state.clearOutput(null);
      expect(state.sessionUpdates).toHaveLength(1);
      expect(state.permissionRequests).toHaveLength(1);
    });
  });

  describe('clearProtocolLog', () => {
    it('clears protocol messages for given session', () => {
      state.protocolMessages = [
        { id: 1, timestamp: 1, direction: 'sent', sessionId: 's1', data: { method: 'test' } } as any,
        { id: 2, timestamp: 2, direction: 'sent', sessionId: 's2', data: { method: 'test' } } as any,
      ];
      state.clearProtocolLog('s1');
      expect(state.protocolMessages).toHaveLength(1);
      expect(state.protocolMessages[0].sessionId).toBe('s2');
    });

    it('clears session-less protocol messages when sessionId is null', () => {
      state.protocolMessages = [
        { id: 1, timestamp: 1, direction: 'sent', sessionId: 's1', data: { method: 'test' } } as any,
        { id: 2, timestamp: 2, direction: 'sent', sessionId: undefined, data: { stderr: 'err' } } as any,
      ];
      state.clearProtocolLog(null);
      expect(state.protocolMessages).toHaveLength(1);
      expect(state.protocolMessages[0].sessionId).toBe('s1');
    });
  });

  describe('onDisconnected', () => {
    it('resets all connection state', () => {
      state.sessions = [{ sessionId: 's1' }];
      state.activeSessionId = 's1';
      state.prompting = true;
      state.connectedCommand = 'test';
      state.agentInfo = {} as any;
      state.sessionUpdates = [{ timestamp: 1, sessionId: 's1', data: {} as any }];
      state.protocolMessages = [{ id: 1, timestamp: 1, direction: 'sent', data: {} as any }];

      state.onDisconnected();

      expect(state.sessions).toEqual([]);
      expect(state.activeSessionId).toBeNull();
      expect(state.prompting).toBe(false);
      expect(state.connectedCommand).toBeNull();
      expect(state.agentInfo).toBeNull();
      expect(state.sessionUpdates).toEqual([]);
      expect(state.protocolMessages).toEqual([]);
    });
  });
});
