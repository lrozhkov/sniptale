import {
  commitVideoWorkspace,
  moveVideoWorkspaceHistory,
  readVideoWorkspace,
  saveVideoWorkspaceAdvanced,
  saveVideoWorkspaceDraft,
} from '../../composition/persistence/review-workspaces/store';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import type { ReviewAnnotation, ReviewOperation } from '../../features/video/review/types';
import { replayReviewHistory } from '../../features/video/review/document';

const persistence = {
  commitVideoWorkspace,
  moveVideoWorkspaceHistory,
  readVideoWorkspace,
  saveVideoWorkspaceAdvanced,
  saveVideoWorkspaceDraft,
};

type Failure = 'conflict' | 'changed-source' | 'missing-media' | 'invalid' | 'storage';
function failureCode(error: unknown): Failure {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error.code === 'conflict' ||
      error.code === 'changed-source' ||
      error.code === 'missing-media' ||
      error.code === 'invalid')
  )
    return error.code;
  return 'storage';
}

/** Serializes one editor's durable operations; the only document authority is persisted history. */
export function createVideoReviewSession(initial: VideoWorkspaceSnapshot, deps = persistence) {
  const project = (snapshot: VideoWorkspaceSnapshot) =>
    replayReviewHistory(
      snapshot.workspace.history,
      snapshot.workspace.cursor,
      snapshot.workspace.source
    );
  let state = {
    snapshot: structuredClone(initial),
    document: project(initial),
    pending: 0,
    error: null as Failure | null,
  };
  let queue: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };
  const identity = () => ({
    aggregateId: state.snapshot.workspace.aggregateId,
    expectedRevision: state.snapshot.workspace.revision,
    expectedSourceAssetId: state.snapshot.workspace.sourceAssetId,
  });
  function enqueue(action: () => Promise<VideoWorkspaceSnapshot>) {
    state = { ...state, pending: state.pending + 1 };
    emit();
    const task = queue.then(async () => {
      try {
        const snapshot = await action();
        state = { ...state, snapshot, document: project(snapshot), error: null };
        return snapshot;
      } catch (error) {
        state = { ...state, error: failureCode(error) };
        throw error;
      } finally {
        state = { ...state, pending: state.pending - 1 };
        emit();
      }
    });
    queue = task.then(
      () => undefined,
      () => undefined
    );
    return task;
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    saveAdvanced(advanced: unknown) {
      const captured = structuredClone(advanced);
      return enqueue(() =>
        deps.saveVideoWorkspaceAdvanced({
          ...identity(),
          advanced: captured,
        })
      );
    },
    saveDraft(annotation: ReviewAnnotation | null, before: ReviewAnnotation | null) {
      const captured = structuredClone({ annotation, before });
      return enqueue(() =>
        deps.saveVideoWorkspaceDraft({
          ...identity(),
          ...captured,
          expectedDraftRevision: state.snapshot.draft?.revision ?? null,
        })
      );
    },
    commit(operation: ReviewOperation, consumeDraft = false) {
      const captured = structuredClone(operation);
      return enqueue(() => {
        if (consumeDraft && !state.snapshot.draft) throw new Error('Review draft is unavailable.');
        return deps.commitVideoWorkspace({
          ...identity(),
          operation: captured,
          ...(consumeDraft ? { consumeDraftRevision: state.snapshot.draft!.revision } : {}),
        });
      });
    },
    history(direction: 'undo' | 'redo') {
      return enqueue(() => deps.moveVideoWorkspaceHistory({ ...identity(), direction }));
    },
    reload() {
      return enqueue(async () => {
        const snapshot = await deps.readVideoWorkspace(initial.workspace.aggregateId);
        if (!snapshot) throw new Error('Review session is unavailable.');
        return snapshot;
      });
    },
    async flush() {
      await queue;
      if (state.error) throw new Error(`Review ${state.error}.`);
    },
  };
}
