import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  connectionUuid,
  parseConnectionAuthentication,
  parseSyncConnectionIdentity,
  parseSyncWorkspaceSource,
  parseConnectionMetadata,
} from '../../composition/persistence/remote-connection/model';
import {
  parseSyncQueueScope,
  queueIdentity,
  queueOrdinal,
  type SyncQueueScope,
} from '../../composition/persistence/sync-capture/queue-model';
import type {
  SyncConnectionAuthentication,
  SyncConnectionIdentity,
  SyncWorkspaceSource,
  SyncConnectionMetadata,
} from '../../composition/persistence/remote-connection/model';
import { parseSyncExecutorSnapshot } from '../../contracts/messaging/contracts/runtime/sync-connection';
import type { SyncExecutorSnapshot } from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import { browserRuntime, runtimeInfo } from '@sniptale/platform/browser/runtime';

// policyStateIds: persistent-data-erasure-lease, popup-export-erasure-exclusion
// Test-only timing state observes these owners without acquiring product authority.
export const SECURITY_E2E_CONTROL_PORT = 'sniptale:security-e2e-control:v1';
export const securityE2ECheckpoints = [
  'persistence-before-commit',
  'popup-export-after-admission',
] as const;

export type SecurityE2ECheckpoint = (typeof securityE2ECheckpoints)[number];

type CheckpointState = {
  pauseRequested: boolean;
  reached: boolean;
  release: (() => void) | undefined;
  waiters: Array<() => void>;
};

type SecurityControlCommand = {
  checkpoint: unknown;
  requestId: string;
  type: string;
};

const states = new Map<SecurityE2ECheckpoint, CheckpointState>();

function stateFor(checkpoint: SecurityE2ECheckpoint): CheckpointState {
  const existing = states.get(checkpoint);
  if (existing) return existing;
  const created: CheckpointState = {
    pauseRequested: false,
    reached: false,
    release: undefined,
    waiters: [],
  };
  states.set(checkpoint, created);
  return created;
}

function parseCheckpoint(value: unknown): SecurityE2ECheckpoint | null {
  return securityE2ECheckpoints.find((checkpoint) => checkpoint === value) ?? null;
}

function parseControlCommand(value: unknown): SecurityControlCommand | null {
  if (!value || typeof value !== 'object') return null;
  if (!('requestId' in value) || !('type' in value)) return null;
  const { requestId, type } = value;
  if (typeof requestId !== 'string' || typeof type !== 'string') return null;
  return {
    checkpoint: 'checkpoint' in value ? value.checkpoint : undefined,
    requestId,
    type,
  };
}

function isSecurityHarnessPort(port: chrome.runtime.Port): boolean {
  const expected = runtimeInfo.getURL('tooling/test/harness/security-control.html');
  return port.name === SECURITY_E2E_CONTROL_PORT && port.sender?.url === expected;
}

function postResponse(port: chrome.runtime.Port, requestId: string, ok: boolean): void {
  port.postMessage({
    ok,
    requestId,
    paused: securityE2ECheckpoints.filter((checkpoint) => stateFor(checkpoint).pauseRequested),
    reached: securityE2ECheckpoints.filter((checkpoint) => stateFor(checkpoint).reached),
  });
}

function handleCheckpointCommand(
  port: chrome.runtime.Port,
  requestId: string,
  type: string,
  checkpoint: SecurityE2ECheckpoint
): void {
  const state = stateFor(checkpoint);
  if (type === 'pause') {
    state.pauseRequested = true;
    state.reached = false;
    postResponse(port, requestId, true);
    return;
  }
  if (type === 'release') {
    state.pauseRequested = false;
    state.reached = false;
    state.release?.();
    state.release = undefined;
    postResponse(port, requestId, true);
    return;
  }
  if (type === 'wait-until-paused') {
    if (state.pauseRequested && state.reached) {
      postResponse(port, requestId, true);
    } else {
      state.waiters.push(() => postResponse(port, requestId, true));
    }
    return;
  }
  postResponse(port, requestId, false);
}

export interface SecurityE2ESyncSelection {
  scope: SyncQueueScope;
  authorization: SyncConnectionIdentity;
  operationId: string;
  expectedRevision: number;
}

export interface SecurityE2ESyncWorkspaceSelection {
  source: SyncWorkspaceSource;
  authentication: SyncConnectionAuthentication;
}

/** Structural injection keeps background runtime ownership outside the app-core control module. */
export interface SecurityE2ESyncRuntime {
  start(
    selection: SecurityE2ESyncSelection
  ): Promise<{ executorId: string; executorRevision: number }>;
  startWorkspace(
    selection: SecurityE2ESyncWorkspaceSelection
  ): Promise<{ executorId: string; executorRevision: number }>;
  enrollWorkspace(selection: SecurityE2ESyncWorkspaceSelection): Promise<SyncConnectionMetadata>;
  inspect(): Promise<SyncExecutorSnapshot | null>;
  reserveErasure(): { quiesce(): Promise<void>; release(): void };
  erase?(): Promise<boolean>;
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return (
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
  );
}
function parseSyncSelection(value: unknown): SecurityE2ESyncSelection | null {
  if (
    !isRecord(value) ||
    !exact(value, ['scope', 'authorization', 'operationId', 'expectedRevision']) ||
    !isRecord(value['scope']) ||
    !exact(value['scope'], ['spaceId', 'connectionGeneration', 'profileCreatedAt'])
  )
    return null;
  const scope = parseSyncQueueScope(value['scope']);
  const authorization = parseSyncConnectionIdentity(value['authorization']);
  if (
    !scope ||
    !authorization ||
    !queueIdentity(value['operationId']) ||
    !queueOrdinal(value['expectedRevision']) ||
    value['expectedRevision'] < 1
  )
    return null;
  return {
    scope,
    authorization,
    operationId: value['operationId'],
    expectedRevision: value['expectedRevision'],
  };
}
type SyncControlCommand =
  | { type: 'sync-start'; requestId: string; selection: SecurityE2ESyncSelection }
  | {
      type: 'sync-workspace-start' | 'sync-workspace-enroll';
      requestId: string;
      selection: SecurityE2ESyncWorkspaceSelection;
    }
  | { type: 'sync-inspect' | 'sync-stop' | 'sync-erase'; requestId: string };

function parseSyncControlCommand(value: unknown): SyncControlCommand | null {
  if (!isRecord(value) || !connectionUuid(value['requestId'])) return null;
  const requestId = value['requestId'];
  if (value['type'] === 'sync-workspace-start' || value['type'] === 'sync-workspace-enroll') {
    if (!exact(value, ['type', 'requestId', 'payload'])) return null;
    const payload = value['payload'];
    if (!isRecord(payload) || !exact(payload, ['source', 'authentication'])) return null;
    const source = parseSyncWorkspaceSource(payload['source']);
    const rawAuthentication = payload['authentication'];
    if (!isRecord(rawAuthentication)) return null;
    const username = rawAuthentication['username'];
    const authentication = parseConnectionAuthentication(
      rawAuthentication,
      typeof username === 'string' ? username : ''
    );
    return source && authentication
      ? { type: value['type'], requestId, selection: { source, authentication } }
      : null;
  }
  if (value['type'] === 'sync-start') {
    if (!exact(value, ['type', 'requestId', 'payload'])) return null;
    const selection = parseSyncSelection(value['payload']);
    return selection ? { type: 'sync-start', requestId, selection } : null;
  }
  if (!exact(value, ['type', 'requestId'])) return null;
  switch (value['type']) {
    case 'sync-inspect':
    case 'sync-stop':
    case 'sync-erase':
      return { type: value['type'], requestId };
    default:
      return null;
  }
}

function projectSyncStartReceipt(receipt: { executorId: string; executorRevision: number }) {
  if (
    !connectionUuid(receipt.executorId) ||
    !queueOrdinal(receipt.executorRevision) ||
    receipt.executorRevision < 1
  )
    throw new Error();
  return { executorId: receipt.executorId, executorRevision: receipt.executorRevision };
}

function projectSyncSnapshot(snapshot: SyncExecutorSnapshot | null): SyncExecutorSnapshot | null {
  if (snapshot === null) return null;
  const parsed = parseSyncExecutorSnapshot(snapshot);
  if (!parsed) throw new Error();
  return parsed;
}

async function executeSyncCommand(command: SyncControlCommand, runtime: SecurityE2ESyncRuntime) {
  switch (command.type) {
    case 'sync-start':
      return projectSyncStartReceipt(await runtime.start(command.selection));
    case 'sync-workspace-start':
      return projectSyncStartReceipt(await runtime.startWorkspace(command.selection));
    case 'sync-workspace-enroll': {
      const connection = parseConnectionMetadata(await runtime.enrollWorkspace(command.selection));
      if (!connection) throw new Error();
      return connection;
    }
    case 'sync-inspect':
      return projectSyncSnapshot(await runtime.inspect());
    case 'sync-erase':
      if (!runtime.erase) throw new Error();
      return runtime.erase();
    case 'sync-stop': {
      const reservation = runtime.reserveErasure();
      try {
        await reservation.quiesce();
      } finally {
        reservation.release();
      }
      return null;
    }
  }
}

async function handleSyncCommand(
  port: chrome.runtime.Port,
  command: SecurityControlCommand,
  message: unknown,
  runtime: SecurityE2ESyncRuntime | undefined
): Promise<void> {
  try {
    const parsed = parseSyncControlCommand(message);
    if (!runtime || !parsed) throw new Error();
    const sync = await executeSyncCommand(parsed, runtime);
    port.postMessage({ ok: true, requestId: parsed.requestId, sync });
  } catch {
    port.postMessage({ ok: false, requestId: command.requestId, sync: null });
  }
}

function handleControlMessage(
  port: chrome.runtime.Port,
  message: unknown,
  runtime?: SecurityE2ESyncRuntime
): void {
  const command = parseControlCommand(message);
  if (!command) return;
  if (command.type.startsWith('sync-')) {
    void handleSyncCommand(port, command, message, runtime);
    return;
  }
  if (command.type === 'snapshot') {
    postResponse(port, command.requestId, true);
    return;
  }
  const checkpoint = parseCheckpoint(command.checkpoint);
  if (!checkpoint) {
    postResponse(port, command.requestId, false);
    return;
  }
  handleCheckpointCommand(port, command.requestId, command.type, checkpoint);
}

export function registerSecurityE2EControl(runtime?: SecurityE2ESyncRuntime): void {
  if (typeof __SNIPTALE_SECURITY_E2E__ === 'undefined' || !__SNIPTALE_SECURITY_E2E__) return;
  browserRuntime.subscribeToConnections((port) => {
    if (!isSecurityHarnessPort(port)) return;
    port.onMessage.addListener((message) => handleControlMessage(port, message, runtime));
    port.onDisconnect.addListener(() => {
      for (const state of states.values()) {
        state.pauseRequested = false;
        state.release?.();
        state.release = undefined;
        state.waiters.splice(0).forEach((resolve) => resolve());
      }
    });
  });
}

export async function securityE2ECheckpoint(checkpoint: SecurityE2ECheckpoint): Promise<void> {
  if (typeof __SNIPTALE_SECURITY_E2E__ === 'undefined' || !__SNIPTALE_SECURITY_E2E__) return;
  const state = stateFor(checkpoint);
  if (!state.pauseRequested) return;
  state.reached = true;
  state.waiters.splice(0).forEach((resolve) => resolve());
  await new Promise<void>((resolve) => {
    state.release = resolve;
  });
  state.reached = false;
}
