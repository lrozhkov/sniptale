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

function handleControlMessage(port: chrome.runtime.Port, message: unknown): void {
  const command = parseControlCommand(message);
  if (!command) return;
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

export function registerSecurityE2EControl(): void {
  if (typeof __SNIPTALE_SECURITY_E2E__ === 'undefined' || !__SNIPTALE_SECURITY_E2E__) return;
  browserRuntime.subscribeToConnections((port) => {
    if (!isSecurityHarnessPort(port)) return;
    port.onMessage.addListener((message) => handleControlMessage(port, message));
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
