import { describe, it, expect, beforeEach } from 'vitest';
import { MainInspectorState } from '../main-state';
import type { InspectorConfigOption, InspectorSessionInfo } from '../../shared/types';

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

  describe('updateSessionConfigOption', () => {
    const option = (id: string, currentValue: string): InspectorConfigOption => ({
      id,
      name: id,
      currentValue,
      options: [],
    });
    const sessionWith = (configOptions: InspectorConfigOption[]): InspectorSessionInfo => ({
      sessionId: 's1',
      configOptions,
    });
    const valueOf = (id: string): string | undefined =>
      state.sessions[0].configOptions.find((o) => o.id === id)?.currentValue;

    it('updates the matching option for the matching session by configId', () => {
      state.sessions = [sessionWith([option('mode', 'old')])];
      state.updateSessionConfigOption('s1', 'mode', 'new');
      expect(valueOf('mode')).toBe('new');
    });

    it('leaves other options on the session untouched', () => {
      state.sessions = [sessionWith([option('mode', 'm-old'), option('effort', 'e-old')])];
      state.updateSessionConfigOption('s1', 'effort', 'e-new');
      expect(valueOf('mode')).toBe('m-old');
      expect(valueOf('effort')).toBe('e-new');
    });

    it('does not update an unknown configId', () => {
      state.sessions = [sessionWith([option('mode', 'old')])];
      state.updateSessionConfigOption('s1', 'model', 'new');
      expect(valueOf('mode')).toBe('old');
    });

    it('does not update a non-matching session', () => {
      state.sessions = [sessionWith([option('mode', 'old')])];
      state.updateSessionConfigOption('s2', 'mode', 'new');
      expect(valueOf('mode')).toBe('old');
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
      state.sessions = [{ sessionId: 's1', configOptions: [] }];
      state.activeSessionId = 's1';
      state.prompting = true;
      state.connectedCommand = 'test';
      state.agentInfo = {} as any;
      state.sessionUpdates = [{ timestamp: 1, sessionId: 's1', data: {} as any }];
      state.protocolMessages = [{ id: 1, timestamp: 1, direction: 'sent', data: {} }];

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
