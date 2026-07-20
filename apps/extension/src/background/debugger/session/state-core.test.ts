import { expect, it, vi } from 'vitest';
import {
  createDebuggerSessionState,
  getAttachedClientsFromState,
  getDebuggerSessionSnapshot,
  getTabIdByTargetIdFromState,
  handleForcefulDebuggerDetach,
  registerAttachedClientInState,
  registerTargetIdForTab,
  releaseAttachedClientFromState,
  seedDebuggerSessionState,
} from './state-core';
import {
  getAttachedClients,
  getDebuggerSessionSnapshotForTests,
  getExistingClientTarget,
  getTabIdByTargetId,
  handleForcefulDetach,
  hasAttachedClient,
  isFirstAttachedClient,
  listAttachedDebuggerClientOwners,
  registerAttachedClient,
  registerTabTargetId,
  releaseAttachedClient,
  resetDebuggerSessionStateForTests,
  seedDebuggerSessionStateForTests,
} from './index';

it('registers clients and target ids in the state snapshot', () => {
  const state = createDebuggerSessionState();

  registerAttachedClientInState(state, 9, 'diagnostics');
  registerAttachedClientInState(state, 9, 'screenshot');
  registerTargetIdForTab(state, 9, 'target-9');

  expect(getAttachedClientsFromState(state, 9)).toEqual(['diagnostics', 'screenshot']);
  expect(getDebuggerSessionSnapshot(state, 9)).toEqual({
    clients: ['diagnostics', 'screenshot'],
    targetId: 'target-9',
  });
  expect(getTabIdByTargetIdFromState(state, 'target-9')).toBe(9);
});

it('replaces old target mappings when a tab target changes', () => {
  const state = createDebuggerSessionState();

  registerTargetIdForTab(state, 9, 'target-9');
  registerTargetIdForTab(state, 9, 'target-10');

  expect(getTabIdByTargetIdFromState(state, 'target-9')).toBeUndefined();
  expect(getTabIdByTargetIdFromState(state, 'target-10')).toBe(9);
});

it('clears the tab session when the last attached client is released', () => {
  const state = createDebuggerSessionState();
  seedDebuggerSessionState(state, 9, ['diagnostics', 'screenshot'], 'target-9');

  expect(releaseAttachedClientFromState(state, 9, 'diagnostics')).toBe('remaining');
  expect(releaseAttachedClientFromState(state, 9, 'screenshot')).toBe('released-last');
  expect(getDebuggerSessionSnapshot(state, 9)).toEqual({ clients: [], targetId: null });
});

it('clears clients and target mappings on a forceful detach', () => {
  const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const state = createDebuggerSessionState();
  seedDebuggerSessionState(state, 9, ['diagnostics'], 'target-9');

  handleForcefulDebuggerDetach(state, 9);

  expect(getDebuggerSessionSnapshot(state, 9)).toEqual({ clients: [], targetId: null });
  expect(getTabIdByTargetIdFromState(state, 'target-9')).toBeUndefined();
  expect(consoleWarnSpy).toHaveBeenCalledWith('[BackgroundDebugger]', 'Forceful detach for tab', 9);
});

it('lists default-store debugger owners with an optional client filter', () => {
  resetDebuggerSessionStateForTests();
  seedDebuggerSessionStateForTests(7, ['diagnostics'], 'target-7');
  seedDebuggerSessionStateForTests(8, ['export-har'], 'target-8');

  expect(listAttachedDebuggerClientOwners()).toEqual([
    { clients: ['diagnostics'], tabId: 7, targetId: 'target-7' },
    { clients: ['export-har'], tabId: 8, targetId: 'target-8' },
  ]);
  expect(listAttachedDebuggerClientOwners('diagnostics')).toEqual([
    { clients: ['diagnostics'], tabId: 7, targetId: 'target-7' },
  ]);
  expect(getAttachedClients(7)).toEqual(['diagnostics']);
  expect(getExistingClientTarget(7, 'diagnostics')).toBe('target-7');
  expect(getTabIdByTargetId('target-7')).toBe(7);
  expect(hasAttachedClient(7, 'diagnostics')).toBe(true);
  expect(isFirstAttachedClient(9)).toBe(true);

  registerAttachedClient(7, 'screenshot');
  registerTabTargetId(7, 'target-next');
  expect(getDebuggerSessionSnapshotForTests(7)).toEqual({
    clients: ['diagnostics', 'screenshot'],
    targetId: 'target-next',
  });
  expect(releaseAttachedClient(7, 'screenshot')).toBe('remaining');
  handleForcefulDetach(8);
  resetDebuggerSessionStateForTests();
});
