import { applyLocalReviewChange, type LocalReviewChange } from './local-session';
import {
  saveVideoWorkspaceSnapshot,
  commitVideoWorkspace,
  moveVideoWorkspaceHistory,
  readVideoWorkspace,
  saveVideoWorkspaceAdvanced,
  saveVideoWorkspaceDraft,
} from '../../composition/persistence/review-workspaces/store';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import type { ReviewAnnotation, ReviewOperation } from '../../features/video/review/types';
import {
  replayReviewHistory,
  reviewAdvancedContentBaseline,
} from '../../features/video/review/document';

const persistence = {
  saveVideoWorkspaceSnapshot,
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
      snapshot.workspace.source,
      reviewAdvancedContentBaseline(snapshot.workspace.advanced)
    );
  let state = {
    snapshot: structuredClone(initial),
    document: project(initial),
    autosaveEnabled: true,
    dirty: false,
    pending: 0,
    error: null as Failure | null,
  };
  let durable = structuredClone(initial);
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
  async function persistBuffer() {
    if (!state.dirty) return state.snapshot;
    const snapshot = await deps.saveVideoWorkspaceSnapshot({
      aggregateId: durable.workspace.aggregateId,
      expectedRevision: durable.workspace.revision,
      expectedSourceAssetId: durable.workspace.sourceAssetId,
      expectedDraftRevision: durable.draft?.revision ?? null,
      workspace: state.snapshot.workspace,
      draft: state.snapshot.draft,
    });
    durable = snapshot;
    state = { ...state, snapshot, dirty: false };
    return snapshot;
  }
  function enqueue(action: () => Promise<VideoWorkspaceSnapshot>, local?: LocalReviewChange) {
    state = { ...state, pending: state.pending + 1 };
    emit();
    const task = queue.then(async () => {
      try {
        if (local && (!state.autosaveEnabled || (state.dirty && local.kind !== 'reset'))) {
          const snapshot = applyLocalReviewChange(state.snapshot, local);
          state = { ...state, snapshot, document: project(snapshot), dirty: true };
          if (!state.autosaveEnabled) return snapshot;
          const committed = await persistBuffer();
          state = { ...state, snapshot: committed, document: project(committed), error: null };
          return committed;
        }
        const snapshot = await action();
        if (!local && state.dirty && !state.autosaveEnabled) return snapshot;
        durable = snapshot;
        state = { ...state, snapshot, document: project(snapshot), dirty: false, error: null };
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
    setAutosaveEnabled(enabled: boolean) {
      state = { ...state, autosaveEnabled: enabled };
      emit();
      if (enabled && state.dirty)
        void enqueue(async () => {
          if (!state.autosaveEnabled) return state.snapshot;
          return persistBuffer();
        }).catch(() => undefined);
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    saveAdvanced(advanced: unknown) {
      const captured = structuredClone(advanced);
      return enqueue(
        () =>
          deps.saveVideoWorkspaceAdvanced({
            ...identity(),
            advanced: captured,
          }),
        { kind: 'advanced', advanced: captured }
      );
    },
    saveDraft(annotation: ReviewAnnotation | null, before: ReviewAnnotation | null) {
      const captured = structuredClone({ annotation, before });
      return enqueue(
        () =>
          deps.saveVideoWorkspaceDraft({
            ...identity(),
            ...captured,
            expectedDraftRevision: state.snapshot.draft?.revision ?? null,
          }),
        { kind: 'draft', ...captured }
      );
    },
    commit(operation: ReviewOperation, consumeDraft = false) {
      const captured = structuredClone(operation);
      return enqueue(
        () => {
          if (consumeDraft && !state.snapshot.draft)
            throw new Error('Review draft is unavailable.');
          return deps.commitVideoWorkspace({
            ...identity(),
            operation: captured,
            ...(consumeDraft ? { consumeDraftRevision: state.snapshot.draft!.revision } : {}),
          });
        },
        { kind: 'commit', operation: captured, consumeDraft }
      );
    },
    /** Clears authored content atomically while preserving source identity and UI preferences. */
    reset() {
      return enqueue(
        async () => {
          const next = applyLocalReviewChange(state.snapshot, { kind: 'reset' });
          return deps.saveVideoWorkspaceSnapshot({
            aggregateId: durable.workspace.aggregateId,
            expectedRevision: durable.workspace.revision,
            expectedSourceAssetId: durable.workspace.sourceAssetId,
            expectedDraftRevision: durable.draft?.revision ?? null,
            workspace: next.workspace,
            draft: next.draft,
          });
        },
        { kind: 'reset' }
      );
    },
    history(direction: 'undo' | 'redo') {
      return enqueue(() => deps.moveVideoWorkspaceHistory({ ...identity(), direction }), {
        kind: 'history',
        direction,
      });
    },
    reload() {
      return enqueue(async () => {
        const snapshot = await deps.readVideoWorkspace(initial.workspace.aggregateId);
        if (!snapshot) throw new Error('Review session is unavailable.');
        state = { ...state, dirty: false };
        return snapshot;
      });
    },
    async flush() {
      await queue;
      if (state.error) throw new Error(`Review ${state.error}.`);
    },
  };
}
