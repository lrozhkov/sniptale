import {
  clearDebuggerSessionState,
  createDebuggerSessionState,
  getAttachedClientsFromState,
  getDebuggerSessionSnapshot,
  getExistingClientTargetFromState,
  getTabIdByTargetIdFromState,
  handleForcefulDebuggerDetach,
  hasAttachedClientInState,
  isFirstAttachedClientInState,
  listDebuggerClientOwnersFromState,
  registerAttachedClientInState,
  registerTargetIdForTab,
  releaseAttachedClientFromState,
  seedDebuggerSessionState,
  type DebuggerClient,
  type DebuggerClientOwnerSnapshot,
  type DebuggerSessionSnapshot,
} from './state-core';

export type { DebuggerClient } from './state-core';

interface DebuggerSessionStore {
  clearAll(): void;
  getAttachedClients(tabId: number): DebuggerClient[];
  getExistingClientTarget(tabId: number, client: DebuggerClient): string | null;
  getSessionSnapshot(tabId: number): DebuggerSessionSnapshot;
  getTabIdByTargetId(targetId: string): number | undefined;
  handleForcefulDetach(tabId: number): void;
  hasAttachedClient(tabId: number, client: DebuggerClient): boolean;
  isFirstClient(tabId: number): boolean;
  listClientOwners(client?: DebuggerClient): DebuggerClientOwnerSnapshot[];
  registerClient(tabId: number, client: DebuggerClient): void;
  registerTargetId(tabId: number, targetId: string): void;
  releaseClient(tabId: number, client: DebuggerClient): 'missing' | 'remaining' | 'released-last';
  seedTabSession(tabId: number, clients: DebuggerClient[], targetId?: string): void;
}

export function createDebuggerSessionStore(): DebuggerSessionStore {
  const state = createDebuggerSessionState();

  return {
    clearAll: () => clearDebuggerSessionState(state),
    getAttachedClients: (tabId) => getAttachedClientsFromState(state, tabId),
    getExistingClientTarget: (tabId, client) =>
      getExistingClientTargetFromState(state, tabId, client),
    getSessionSnapshot: (tabId) => getDebuggerSessionSnapshot(state, tabId),
    getTabIdByTargetId: (targetId) => getTabIdByTargetIdFromState(state, targetId),
    handleForcefulDetach: (tabId) => handleForcefulDebuggerDetach(state, tabId),
    hasAttachedClient: (tabId, client) => hasAttachedClientInState(state, tabId, client),
    isFirstClient: (tabId) => isFirstAttachedClientInState(state, tabId),
    listClientOwners: (client) => listDebuggerClientOwnersFromState(state, client),
    registerClient: (tabId, client) => registerAttachedClientInState(state, tabId, client),
    registerTargetId: (tabId, targetId) => registerTargetIdForTab(state, tabId, targetId),
    releaseClient: (tabId, client) => releaseAttachedClientFromState(state, tabId, client),
    seedTabSession: (tabId, clients, targetId) =>
      seedDebuggerSessionState(state, tabId, clients, targetId),
  };
}
