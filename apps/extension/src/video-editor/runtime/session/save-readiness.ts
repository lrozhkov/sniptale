import type { VideoEditorSaveState } from '../../contracts/session-state';

const SAVE_SETTLE_TIMEOUT_MS = 15_000;
interface SaveReadinessSnapshot {
  projectId: string;
  saveState: VideoEditorSaveState;
  generation: symbol;
  requestedVersion: number;
  savedVersion: number;
}

let currentSnapshot: SaveReadinessSnapshot | null = null;
let listeners: Array<(snapshot: SaveReadinessSnapshot) => void> = [];
let latestBarrier: { projectId: string; generation: symbol; flush: () => Promise<void> } | null =
  null;

/** Leases the mounted writer's latest-document barrier; stale cleanup cannot detach its successor. */
export function registerVideoEditorSaveBarrier(
  projectId: string,
  generation: symbol,
  flush: () => Promise<void>
): () => void {
  const lease = { projectId, generation, flush };
  latestBarrier = lease;
  return () => {
    if (latestBarrier === lease) latestBarrier = null;
  };
}

/** Publishes local edit acknowledgement; workspace revision remains owned by persistence. */
export function publishVideoEditorSaveReadiness(snapshot: SaveReadinessSnapshot): void {
  currentSnapshot = snapshot;
  for (const listener of listeners) listener(snapshot);
}

/** Waits for the latest active edit version before project transition or promotion. */
export async function waitForVideoEditorSave(projectId: string): Promise<void> {
  const current = currentSnapshot;
  if (current?.projectId !== projectId) throw new Error('The open video project changed.');
  const barrier = latestBarrier;
  if (barrier?.projectId === projectId && barrier.generation === current.generation) {
    await barrier.flush();
    if (currentSnapshot?.generation !== current.generation || latestBarrier !== barrier)
      throw new Error('The open video project changed.');
    return;
  }
  if (current.savedVersion >= current.requestedVersion) return;
  if (current.saveState === 'error' || current.saveState === 'conflict') {
    throw new Error('The video project has unsaved changes.');
  }
  await observeSaveVersion(projectId, current.generation, current.requestedVersion, true).promise;
}

function subscribeToSaveReadiness(listener: (snapshot: SaveReadinessSnapshot) => void): () => void {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((candidate) => candidate !== listener);
  };
}

function observeSaveVersion(
  projectId: string,
  generation: symbol | undefined,
  target?: number,
  latest = false
) {
  let cancel = () => undefined;
  const initialVersion =
    currentSnapshot?.projectId === projectId ? currentSnapshot.requestedVersion : 0;
  const retryVersion =
    currentSnapshot?.projectId === projectId && currentSnapshot.saveState === 'error'
      ? currentSnapshot.requestedVersion
      : undefined;
  const promise = new Promise<void>((resolve, reject) => {
    let settled = false;
    let observedVersion = target;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unsubscribe();
      if (error) reject(error);
      else resolve();
    };
    const unsubscribe = subscribeToSaveReadiness((snapshot) => {
      if (
        snapshot.projectId !== projectId ||
        (generation !== undefined && snapshot.generation !== generation)
      ) {
        finish(new Error('The video project could not be saved.'));
        return;
      }
      if (
        latest ||
        (observedVersion === undefined &&
          (snapshot.requestedVersion > initialVersion ||
            (retryVersion !== undefined &&
              snapshot.requestedVersion === retryVersion &&
              snapshot.saveState === 'dirty')))
      ) {
        observedVersion = snapshot.requestedVersion;
      }
      if (observedVersion !== undefined && snapshot.savedVersion >= observedVersion) finish();
      else if (snapshot.saveState === 'error' || snapshot.saveState === 'conflict') {
        finish(new Error('The video project could not be saved.'));
      }
    });
    const timeout = globalThis.setTimeout(
      () => finish(new Error('The video project did not finish saving.')),
      SAVE_SETTLE_TIMEOUT_MS
    );
    cancel = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unsubscribe();
    };
  });
  return { promise, cancel };
}

/** Subscribes before a mutation and waits for the first new edit version it publishes. */
export function observeVideoEditorSave(projectId: string): {
  promise: Promise<void>;
  cancel(): void;
} {
  const current = currentSnapshot;
  return observeSaveVersion(
    projectId,
    current?.projectId === projectId ? current.generation : undefined
  );
}
