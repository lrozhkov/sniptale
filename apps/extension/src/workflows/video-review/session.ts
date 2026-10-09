import type { ReviewSpeechTarget } from '../../contracts/ai/audio';
import { parseReviewOriginalSpeechTranscript } from '../../features/video/review/original-speech';
import {
  collectReviewAssetReferences,
  reviewWorkspaceHasSpeechReplacement,
} from '../../composition/persistence/review-workspaces/asset-refs';
import { parseReviewSpeechTranscript } from '../../features/video/review/speech-validation';
import type { ReviewSpeechTranscript } from '../../features/video/review/speech-transcript';
import {
  applyLocalReviewChange,
  prepareReviewSpeechTranscriptChange,
  type LocalReviewChange,
} from './local-session';
import {
  saveVideoWorkspaceSnapshot,
  commitVideoWorkspace,
  moveVideoWorkspaceHistory,
  readVideoWorkspace,
  saveVideoWorkspaceAdvanced,
  saveVideoWorkspaceDraft,
} from '../../composition/persistence/review-workspaces/store';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import type {
  ReviewAnnotation,
  ReviewHistoryDirection,
  ReviewOperation,
} from '../../features/video/review/types';
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

/** A clean buffer cannot hide a previous failed operation; explicit retry requires local edits. */
function saveExplicitReviewBuffer(
  state: { error: Failure | null; dirty: boolean },
  save: () => Promise<VideoWorkspaceSnapshot>
) {
  if (state.error && !state.dirty) throw new Error(`Review ${state.error}.`);
  return save();
}

/** Both Save and Reset compare against the last durable snapshot, including its draft revision. */
function reviewSnapshotSaveRequest(
  durable: VideoWorkspaceSnapshot,
  next: VideoWorkspaceSnapshot
): Parameters<typeof saveVideoWorkspaceSnapshot>[0] {
  return {
    aggregateId: durable.workspace.aggregateId,
    expectedRevision: durable.workspace.revision,
    expectedSourceAssetId: durable.workspace.sourceAssetId,
    expectedDraftRevision: durable.draft?.revision ?? null,
    workspace: next.workspace,
    draft: next.draft,
  };
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
  let failedHistory = false;
  let failedSpeechSave: string | undefined;
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
    const snapshot = await deps.saveVideoWorkspaceSnapshot(
      reviewSnapshotSaveRequest(durable, state.snapshot)
    );
    durable = snapshot;
    state = { ...state, snapshot, dirty: false };
    return snapshot;
  }
  function enqueue(
    action: () => Promise<VideoWorkspaceSnapshot>,
    local?: LocalReviewChange,
    speechSaveKey?: string
  ) {
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
        failedSpeechSave = undefined;
        state = { ...state, snapshot, document: project(snapshot), dirty: false, error: null };
        return snapshot;
      } catch (error) {
        failedHistory = local?.kind === 'history';
        if (!speechSaveKey || !state.error || failedSpeechSave === speechSaveKey)
          failedSpeechSave = speechSaveKey;
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
    async hasRetainedAssetReference(assetId: string) {
      const saved = await deps.readVideoWorkspace(initial.workspace.aggregateId);
      if (!saved) throw new Error('Review session is unavailable.');
      return collectReviewAssetReferences(saved.workspace).has(assetId);
    },
    async hasDurableVoiceoverClip(clipId: string, assetId: string) {
      const saved = await deps.readVideoWorkspace(initial.workspace.aggregateId);
      return (
        !!saved &&
        project(saved).advancedContent.audio.voiceover.some(
          (clip) => clip.id === clipId && clip.assetId === assetId
        )
      );
    },
    async hasDurableSpeechAsset(
      target: ReviewSpeechTarget,
      replacementId: string,
      assetId: string
    ) {
      const saved = await deps.readVideoWorkspace(initial.workspace.aggregateId);
      return (
        !!saved &&
        reviewWorkspaceHasSpeechReplacement(saved.workspace, target, replacementId, assetId)
      );
    },
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
    /** Builds speech history at queue execution time; only this failed save can be retried. */
    saveSpeechTranscript(
      target: ReviewSpeechTarget,
      expectedAssetId: string,
      transcript: ReviewSpeechTranscript
    ) {
      const captured =
        target.kind === 'original'
          ? parseReviewOriginalSpeechTranscript(structuredClone(transcript))
          : parseReviewSpeechTranscript(structuredClone(transcript));
      if (!captured) return Promise.reject(new Error('Invalid speech transcript.'));
      const key = JSON.stringify([target, expectedAssetId]);
      return enqueue(
        async () => {
          if (state.error && failedSpeechSave !== key) throw new Error(`Review ${state.error}.`);
          await persistBuffer();
          const change = prepareReviewSpeechTranscriptChange(
            state.document.advancedContent,
            target,
            state.snapshot.workspace.sourceAssetId,
            expectedAssetId,
            captured
          );
          if (!change) return state.snapshot;
          return deps.commitVideoWorkspace({
            ...identity(),
            operation: {
              id: crypto.randomUUID(),
              at: Date.now(),
              ...change,
            },
          });
        },
        undefined,
        key
      );
    },
    /** Explicit Save persists buffered edits and this operation even with autosave disabled. */
    commitDurable(operation: ReviewOperation) {
      const captured = structuredClone(operation);
      return enqueue(async () => {
        await persistBuffer();
        return deps.commitVideoWorkspace({ ...identity(), operation: captured });
      });
    },
    /** Explicit Save of the entire local workspace buffer; opening an API form never invokes it. */
    saveBuffered: () => enqueue(() => saveExplicitReviewBuffer(state, persistBuffer)),
    /** Clears authored content atomically while preserving source identity and UI preferences. */
    reset() {
      return enqueue(
        async () => {
          const next = applyLocalReviewChange(state.snapshot, { kind: 'reset' });
          return deps.saveVideoWorkspaceSnapshot(reviewSnapshotSaveRequest(durable, next));
        },
        { kind: 'reset' }
      );
    },
    history(direction: ReviewHistoryDirection) {
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
    async flush(options?: { retryHistory: true }) {
      const hadPending = state.pending > 0;
      await queue;
      // Only a completed history failure may be retried; pending/content failures stay strict.
      if (state.error && !(options?.retryHistory && failedHistory && !hadPending))
        throw new Error(`Review ${state.error}.`);
    },
  };
}
