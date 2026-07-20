import { createLogger } from '@sniptale/platform/observability/logger';

export type DebuggerClient = 'screenshot' | 'diagnostics' | 'video-emulation' | 'export-har';

export interface DebuggerSessionSnapshot {
  clients: DebuggerClient[];
  targetId: string | null;
}

export interface DebuggerClientOwnerSnapshot extends DebuggerSessionSnapshot {
  tabId: number;
}

interface DebuggerSessionState {
  attachedClientsByTab: Map<number, Set<DebuggerClient>>;
  tabIdByTargetId: Map<string, number>;
  targetIdByTabId: Map<number, string>;
}

const logger = createLogger({ namespace: 'BackgroundDebugger' });

export function createDebuggerSessionState(): DebuggerSessionState {
  return {
    attachedClientsByTab: new Map(),
    tabIdByTargetId: new Map(),
    targetIdByTabId: new Map(),
  };
}

export function clearDebuggerSessionState(state: DebuggerSessionState): void {
  state.attachedClientsByTab.clear();
  state.tabIdByTargetId.clear();
  state.targetIdByTabId.clear();
}

export function getAttachedClientsFromState(
  state: DebuggerSessionState,
  tabId: number
): DebuggerClient[] {
  const clients = state.attachedClientsByTab.get(tabId);
  return clients ? Array.from(clients) : [];
}

export function getExistingClientTargetFromState(
  state: DebuggerSessionState,
  tabId: number,
  client: DebuggerClient
): string | null {
  const clients = state.attachedClientsByTab.get(tabId);
  if (!clients?.has(client)) {
    return null;
  }

  return state.targetIdByTabId.get(tabId) ?? null;
}

export function getDebuggerSessionSnapshot(
  state: DebuggerSessionState,
  tabId: number
): DebuggerSessionSnapshot {
  return {
    clients: getAttachedClientsFromState(state, tabId),
    targetId: state.targetIdByTabId.get(tabId) ?? null,
  };
}

export function listDebuggerClientOwnersFromState(
  state: DebuggerSessionState,
  client?: DebuggerClient
): DebuggerClientOwnerSnapshot[] {
  return [...state.attachedClientsByTab.entries()].flatMap(([tabId, clients]) => {
    if (client && !clients.has(client)) {
      return [];
    }
    return [
      {
        tabId,
        clients: [...clients],
        targetId: state.targetIdByTabId.get(tabId) ?? null,
      },
    ];
  });
}

export function getTabIdByTargetIdFromState(
  state: DebuggerSessionState,
  targetId: string
): number | undefined {
  return state.tabIdByTargetId.get(targetId);
}

export function handleForcefulDebuggerDetach(state: DebuggerSessionState, tabId: number): void {
  logger.warn('Forceful detach for tab', tabId);
  clearTabSession(state, tabId);
}

export function hasAttachedClientInState(
  state: DebuggerSessionState,
  tabId: number,
  client: DebuggerClient
): boolean {
  return state.attachedClientsByTab.get(tabId)?.has(client) ?? false;
}

export function isFirstAttachedClientInState(state: DebuggerSessionState, tabId: number): boolean {
  return (state.attachedClientsByTab.get(tabId)?.size ?? 0) === 0;
}

export function registerAttachedClientInState(
  state: DebuggerSessionState,
  tabId: number,
  client: DebuggerClient
): void {
  ensureClientSet(state, tabId).add(client);
}

export function registerTargetIdForTab(
  state: DebuggerSessionState,
  tabId: number,
  targetId: string
): void {
  clearTabTargetMapping(state, tabId);
  state.targetIdByTabId.set(tabId, targetId);
  state.tabIdByTargetId.set(targetId, tabId);
}

export function releaseAttachedClientFromState(
  state: DebuggerSessionState,
  tabId: number,
  client: DebuggerClient
): 'missing' | 'remaining' | 'released-last' {
  const clients = state.attachedClientsByTab.get(tabId);
  if (!clients) {
    return 'missing';
  }

  clients.delete(client);
  if (clients.size > 0) {
    return 'remaining';
  }

  clearTabSession(state, tabId);
  return 'released-last';
}

export function seedDebuggerSessionState(
  state: DebuggerSessionState,
  tabId: number,
  clients: DebuggerClient[],
  targetId?: string
): void {
  state.attachedClientsByTab.set(tabId, new Set(clients));
  clearTabTargetMapping(state, tabId);

  if (targetId) {
    state.targetIdByTabId.set(tabId, targetId);
    state.tabIdByTargetId.set(targetId, tabId);
  }
}

function clearTabSession(state: DebuggerSessionState, tabId: number): void {
  state.attachedClientsByTab.delete(tabId);
  clearTabTargetMapping(state, tabId);
}

function clearTabTargetMapping(state: DebuggerSessionState, tabId: number): void {
  const currentTargetId = state.targetIdByTabId.get(tabId);
  if (!currentTargetId) {
    return;
  }

  state.targetIdByTabId.delete(tabId);
  state.tabIdByTargetId.delete(currentTargetId);
}

function ensureClientSet(state: DebuggerSessionState, tabId: number): Set<DebuggerClient> {
  let clients = state.attachedClientsByTab.get(tabId);
  if (!clients) {
    clients = new Set<DebuggerClient>();
    state.attachedClientsByTab.set(tabId, clients);
  }

  return clients;
}
