// policyStateIds: [] - this per-tab queue only serializes lifecycle effects;
// persisted pin and access owners remain authoritative.
type PinnedToolbarOperation = {
  isCurrent(): boolean;
  runExclusive<T>(work: () => Promise<T>): Promise<T>;
};

type PinnedToolbarOperationState = {
  chain: Promise<void>;
  generation: number;
};

const operationStates = new Map<number, PinnedToolbarOperationState>();
let permissionCleanupBarrier: Promise<void> = Promise.resolve();

function createOperationState(): PinnedToolbarOperationState {
  return {
    chain: Promise.resolve(),
    generation: 0,
  };
}

function createPinnedToolbarOperation(
  tabId: number,
  state: PinnedToolbarOperationState,
  generation: number
): PinnedToolbarOperation {
  let started = false;
  const isCurrent = () => operationStates.get(tabId) === state && state.generation === generation;

  return {
    isCurrent,
    runExclusive<T>(work: () => Promise<T>): Promise<T> {
      if (started) {
        return Promise.reject(new Error('Pinned toolbar operation already started'));
      }
      started = true;

      const operation = Promise.all([
        state.chain.catch(() => undefined),
        permissionCleanupBarrier.catch(() => undefined),
      ]).then(work);
      state.chain = operation.then(
        () => undefined,
        () => undefined
      );
      return operation;
    },
  };
}

function acquirePinnedToolbarOperationState(tabId: number): PinnedToolbarOperationState {
  const state = operationStates.get(tabId) ?? createOperationState();
  operationStates.set(tabId, state);
  return state;
}

export function beginPinnedToolbarOperation(tabId: number): PinnedToolbarOperation {
  const state = acquirePinnedToolbarOperationState(tabId);
  state.generation += 1;
  return createPinnedToolbarOperation(tabId, state, state.generation);
}

export function observePinnedToolbarOperations(tabId: number): PinnedToolbarOperation {
  const state = acquirePinnedToolbarOperationState(tabId);
  return createPinnedToolbarOperation(tabId, state, state.generation);
}

export function invalidatePinnedToolbarOperations(tabId: number): void {
  const state = operationStates.get(tabId);
  if (state) {
    state.generation += 1;
  }
}

function invalidateAllPinnedToolbarOperations(): void {
  for (const state of operationStates.values()) {
    state.generation += 1;
  }
}

export function runPinnedToolbarPermissionCleanup(work: () => Promise<void>): Promise<void> {
  invalidateAllPinnedToolbarOperations();
  const pendingOperations = Array.from(operationStates.values(), (state) => state.chain);
  const cleanup = permissionCleanupBarrier
    .catch(() => undefined)
    .then(() => Promise.all(pendingOperations.map((operation) => operation.catch(() => undefined))))
    .then(work);
  permissionCleanupBarrier = cleanup.then(
    () => undefined,
    () => undefined
  );
  return cleanup;
}

export function clearPinnedToolbarOperationState(tabId: number): void {
  const state = operationStates.get(tabId);
  if (state) {
    state.generation += 1;
    operationStates.delete(tabId);
  }
}
