// policyStateIds: [] - this per-tab queue only serializes lifecycle effects;
// persisted pin and access owners remain authoritative.
type PinnedToolbarOperation = {
  isCurrent(): boolean;
  runExclusive<T>(work: () => Promise<T>): Promise<T>;
};

type PinnedToolbarOperationState = {
  chain: Promise<void>;
  documentGeneration: number;
  mutationGeneration: number;
  restoreGeneration: number;
};

const operationStates = new Map<number, PinnedToolbarOperationState>();
let permissionCleanupBarrier: Promise<void> = Promise.resolve();

function createOperationState(): PinnedToolbarOperationState {
  return {
    chain: Promise.resolve(),
    documentGeneration: 0,
    mutationGeneration: 0,
    restoreGeneration: 0,
  };
}

function createPinnedToolbarOperation(
  tabId: number,
  state: PinnedToolbarOperationState,
  isCurrentOperation: () => boolean
): PinnedToolbarOperation {
  let started = false;
  const isCurrent = () => operationStates.get(tabId) === state && isCurrentOperation();

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
  state.mutationGeneration += 1;
  const documentGeneration = state.documentGeneration;
  const mutationGeneration = state.mutationGeneration;
  return createPinnedToolbarOperation(
    tabId,
    state,
    () =>
      state.documentGeneration === documentGeneration &&
      state.mutationGeneration === mutationGeneration
  );
}

export function beginPinnedToolbarDurableOperation(tabId: number): PinnedToolbarOperation {
  const state = acquirePinnedToolbarOperationState(tabId);
  state.mutationGeneration += 1;
  const mutationGeneration = state.mutationGeneration;
  return createPinnedToolbarOperation(
    tabId,
    state,
    () => state.mutationGeneration === mutationGeneration
  );
}

export function beginPinnedToolbarRestoreOperation(tabId: number): PinnedToolbarOperation {
  const state = acquirePinnedToolbarOperationState(tabId);
  state.restoreGeneration += 1;
  const documentGeneration = state.documentGeneration;
  const mutationGeneration = state.mutationGeneration;
  const restoreGeneration = state.restoreGeneration;
  return createPinnedToolbarOperation(
    tabId,
    state,
    () =>
      state.documentGeneration === documentGeneration &&
      state.mutationGeneration === mutationGeneration &&
      state.restoreGeneration === restoreGeneration
  );
}

export function observePinnedToolbarOperations(tabId: number): PinnedToolbarOperation {
  const state = acquirePinnedToolbarOperationState(tabId);
  const documentGeneration = state.documentGeneration;
  const mutationGeneration = state.mutationGeneration;
  const restoreGeneration = state.restoreGeneration;
  return createPinnedToolbarOperation(
    tabId,
    state,
    () =>
      state.documentGeneration === documentGeneration &&
      state.mutationGeneration === mutationGeneration &&
      state.restoreGeneration === restoreGeneration
  );
}

export function invalidatePinnedToolbarOperations(tabId: number): void {
  const state = operationStates.get(tabId);
  if (state) {
    state.documentGeneration += 1;
    state.restoreGeneration += 1;
  }
}

function invalidateAllDocumentBoundPinnedToolbarOperations(): void {
  for (const state of operationStates.values()) {
    state.documentGeneration += 1;
    state.restoreGeneration += 1;
  }
}

export function runPinnedToolbarPermissionCleanup(work: () => Promise<void>): Promise<void> {
  invalidateAllDocumentBoundPinnedToolbarOperations();
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
    operationStates.delete(tabId);
  }
}
