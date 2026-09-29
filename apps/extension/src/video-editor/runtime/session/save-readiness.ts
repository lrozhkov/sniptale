import type { VideoEditorSaveState } from '../../contracts/session-state';

const SAVE_SETTLE_TIMEOUT_MS = 15_000;
interface SaveReadinessSnapshot {
  projectId: string;
  saveState: VideoEditorSaveState;
}

let currentSnapshot: SaveReadinessSnapshot | null = null;
let listeners: Array<(snapshot: SaveReadinessSnapshot) => void> = [];

export function publishVideoEditorSaveReadiness(snapshot: SaveReadinessSnapshot): void {
  currentSnapshot = snapshot;
  for (const listener of listeners) listener(snapshot);
}

/**
 * Waits until the active project's authoritative autosave has settled.
 */
export async function waitForVideoEditorSave(projectId: string): Promise<void> {
  const current = currentSnapshot;
  if (current?.projectId !== projectId) {
    throw new Error('The open video project changed.');
  }
  if (current.saveState === 'saved') return;
  if (current.saveState === 'error' || current.saveState === 'conflict') {
    throw new Error('The video project has unsaved changes.');
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      unsubscribe();
      reject(new Error('The video project did not finish saving.'));
    }, SAVE_SETTLE_TIMEOUT_MS);
    const listener = (state: SaveReadinessSnapshot) => {
      if (
        state.projectId !== projectId ||
        state.saveState === 'error' ||
        state.saveState === 'conflict'
      ) {
        globalThis.clearTimeout(timeout);
        unsubscribe();
        reject(new Error('The video project could not be saved.'));
      } else if (state.saveState === 'saved') {
        globalThis.clearTimeout(timeout);
        unsubscribe();
        resolve();
      }
    };
    const unsubscribe = subscribeToSaveReadiness(listener);
  });
}

function subscribeToSaveReadiness(listener: (snapshot: SaveReadinessSnapshot) => void): () => void {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((candidate) => candidate !== listener);
  };
}

/** Observe the save triggered by a mutation, rather than an earlier saved state. */
export function observeVideoEditorSave(projectId: string): {
  promise: Promise<void>;
  cancel(): void;
} {
  let cancel = () => undefined;
  const promise = new Promise<void>((resolve, reject) => {
    let changed = false;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unsubscribe();
      if (error) reject(error);
      else resolve();
    };
    const unsubscribe = subscribeToSaveReadiness((snapshot) => {
      if (snapshot.projectId !== projectId) {
        finish(new Error('The open video project changed.'));
      } else if (snapshot.saveState === 'error' || snapshot.saveState === 'conflict') {
        finish(new Error('The video project could not be saved.'));
      } else if (snapshot.saveState === 'dirty' || snapshot.saveState === 'saving') {
        changed = true;
      } else if (snapshot.saveState === 'saved' && changed) {
        finish();
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
