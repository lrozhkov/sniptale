import { expect, it } from 'vitest';
import { createDebuggerSessionStore } from './store';

it('exposes the session-state core through a stable store API', () => {
  const store = createDebuggerSessionStore();

  store.registerClient(9, 'diagnostics');
  store.registerTargetId(9, 'target-9');

  expect(store.getAttachedClients(9)).toEqual(['diagnostics']);
  expect(store.getExistingClientTarget(9, 'diagnostics')).toBe('target-9');
  expect(store.getSessionSnapshot(9)).toEqual({
    clients: ['diagnostics'],
    targetId: 'target-9',
  });
  expect(store.getTabIdByTargetId('target-9')).toBe(9);
});

it('supports seed/release/clear flows through the store wrapper', () => {
  const store = createDebuggerSessionStore();

  store.seedTabSession(7, ['screenshot', 'diagnostics'], 'target-7');

  expect(store.releaseClient(7, 'screenshot')).toBe('remaining');
  expect(store.releaseClient(7, 'diagnostics')).toBe('released-last');
  expect(store.getSessionSnapshot(7)).toEqual({ clients: [], targetId: null });

  store.seedTabSession(11, ['export-har'], 'target-11');
  store.clearAll();
  expect(store.getSessionSnapshot(11)).toEqual({ clients: [], targetId: null });
});
