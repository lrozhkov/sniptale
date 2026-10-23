import { SnapshotHistory } from '@sniptale/foundation/history/snapshot-history';
import {
  createDrawingSession,
  type DrawingDocumentCommit,
  type DrawingDocumentV1,
} from '../../../../features/drawing/public';

export interface CropDrawingHistory {
  getState(): { canUndo: boolean; canRedo: boolean };
  subscribe(listener: () => void): () => void;
  undo(): void;
  redo(): void;
}

export function createCropDrawingHistory() {
  const empty: DrawingDocumentV1 = { version: 1, objects: [] };
  const snapshots = new SnapshotHistory(empty);
  const listeners = new Set<() => void>();
  let replay: DrawingDocumentCommit['replay'] | null = null;
  let disposed = false;
  let state = { canUndo: false, canRedo: false };
  const publish = () => {
    const snapshot = snapshots.getState();
    state = { canUndo: snapshot.canUndo, canRedo: snapshot.canRedo };
    listeners.forEach((listener) => listener());
  };
  const navigate = (direction: 'undo' | 'redo') => {
    if (disposed || !replay) return;
    const current = snapshots.getState();
    const index = current.index + (direction === 'undo' ? -1 : 1);
    const next = snapshots.getSnapshots()[index];
    if (!next || !replay(next)) return;
    if (direction === 'undo') snapshots.undo();
    else snapshots.redo();
    publish();
  };
  const session = createDrawingSession({
    onDocumentCommit(commit) {
      if (disposed) return false;
      replay = commit.replay;
      if (JSON.stringify(commit.before) === JSON.stringify(commit.after)) return true;
      snapshots.push(commit.after);
      publish();
      return true;
    },
    onDispose() {
      disposed = true;
      replay = null;
      snapshots.reset(empty);
      state = { canUndo: false, canRedo: false };
      listeners.clear();
    },
  });
  return {
    session,
    getState: () => state,
    subscribe(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    undo: () => navigate('undo'),
    redo: () => navigate('redo'),
  };
}
