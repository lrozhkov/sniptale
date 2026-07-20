// policyStateIds: [] - debugger attachment state is internal effect authority, not route policy.
import { createDebuggerSessionStore, type DebuggerClient } from './store';

export type { DebuggerClient } from './store';

let defaultDebuggerSessionStore: ReturnType<typeof createDebuggerSessionStore> | null = null;

function getDefaultDebuggerSessionStore() {
  defaultDebuggerSessionStore ??= createDebuggerSessionStore();
  return defaultDebuggerSessionStore;
}

export function getAttachedClients(tabId: number): DebuggerClient[] {
  return getDefaultDebuggerSessionStore().getAttachedClients(tabId);
}

export function getExistingClientTarget(tabId: number, client: DebuggerClient): string | null {
  return getDefaultDebuggerSessionStore().getExistingClientTarget(tabId, client);
}

export function getTabIdByTargetId(targetId: string): number | undefined {
  return getDefaultDebuggerSessionStore().getTabIdByTargetId(targetId);
}

export function handleForcefulDetach(tabId: number): void {
  getDefaultDebuggerSessionStore().handleForcefulDetach(tabId);
}

export function hasAttachedClient(tabId: number, client: DebuggerClient): boolean {
  return getDefaultDebuggerSessionStore().hasAttachedClient(tabId, client);
}

export function isFirstAttachedClient(tabId: number): boolean {
  return getDefaultDebuggerSessionStore().isFirstClient(tabId);
}

export function listAttachedDebuggerClientOwners(client?: DebuggerClient) {
  return getDefaultDebuggerSessionStore().listClientOwners(client);
}

export function registerAttachedClient(tabId: number, client: DebuggerClient): void {
  getDefaultDebuggerSessionStore().registerClient(tabId, client);
}

export function registerTabTargetId(tabId: number, targetId: string): void {
  getDefaultDebuggerSessionStore().registerTargetId(tabId, targetId);
}

export function releaseAttachedClient(
  tabId: number,
  client: DebuggerClient
): 'missing' | 'remaining' | 'released-last' {
  return getDefaultDebuggerSessionStore().releaseClient(tabId, client);
}

export function resetDebuggerSessionStateForTests(): void {
  getDefaultDebuggerSessionStore().clearAll();
}

export function seedDebuggerSessionStateForTests(
  tabId: number,
  clients: DebuggerClient[],
  targetId?: string
): void {
  getDefaultDebuggerSessionStore().seedTabSession(tabId, clients, targetId);
}

export function getDebuggerSessionSnapshotForTests(tabId: number): {
  clients: DebuggerClient[];
  targetId: string | null;
} {
  return getDefaultDebuggerSessionStore().getSessionSnapshot(tabId);
}
