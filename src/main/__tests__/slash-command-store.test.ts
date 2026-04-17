import { describe, it, expect, beforeEach } from 'vitest';
import { SlashCommandStore } from '../slash-command-store';

describe('SlashCommandStore', () => {
  let store: SlashCommandStore;

  beforeEach(() => {
    store = new SlashCommandStore();
  });

  it('returns empty array for unknown session', () => {
    expect(store.get('unknown')).toEqual([]);
  });

  it('stores and retrieves commands for a session', () => {
    const commands = [{ name: '/test', description: 'Test command' }];
    store.set('s1', commands);
    expect(store.get('s1')).toEqual(commands);
  });

  it('replaces commands on subsequent set', () => {
    store.set('s1', [{ name: '/a', description: 'A' }]);
    store.set('s1', [{ name: '/b', description: 'B' }]);
    expect(store.get('s1')).toEqual([{ name: '/b', description: 'B' }]);
  });

  it('clearSession removes commands for one session', () => {
    store.set('s1', [{ name: '/a', description: 'A' }]);
    store.set('s2', [{ name: '/b', description: 'B' }]);
    store.clearSession('s1');
    expect(store.get('s1')).toEqual([]);
    expect(store.get('s2')).toEqual([{ name: '/b', description: 'B' }]);
  });

  it('clear removes all commands', () => {
    store.set('s1', [{ name: '/a', description: 'A' }]);
    store.set('s2', [{ name: '/b', description: 'B' }]);
    store.clear();
    expect(store.get('s1')).toEqual([]);
    expect(store.get('s2')).toEqual([]);
  });
});
