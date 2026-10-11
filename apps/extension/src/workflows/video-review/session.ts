import { createAutosaveCoordinator, type AutosavePolicy } from '@sniptale/platform/data/autosave';
import {
  createReviewAnnotationResourceRetention,
  type ReviewPreparedAnnotationResource,
} from './annotation-resources';
import type {
  ReviewAnnotationEffect,
  ReviewAnnotationEffectSnapshot,
} from '../../features/video/review/annotation-effects/types';
import type {
  QuickEditAdvancedContent,
  QuickEditAdvancedState,
} from '../../features/video/review/advanced/types';
import { loadQuickEditAdvancedContentState } from '../../features/video/review/advanced/validation';
import type { ReviewSpeechTarget } from '../../contracts/ai/audio';
import { parseReviewOriginalSpeechTranscript } from '../../features/video/review/original-speech';
import {
  collectReviewAssetReferences,
  reviewWorkspaceHasAudioClip,
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
  createReviewAdvancedContentOperation,
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

type AutosaveKey = 'advanced' | 'content' | 'draft';
type AutosaveCapture = {
  change:
    | { kind: 'advanced'; advanced: QuickEditAdvancedState }
    | { kind: 'content'; content: QuickEditAdvancedContent }
    | { kind: 'draft'; annotation: ReviewAnnotation | null; before: ReviewAnnotation | null };
  acknowledge(): void;
  fail(error: unknown): void;
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
  let failedHistory = false;
  let failedSpeechSave: string | undefined;
  let disposed = false;
  let disposal: Promise<void> | undefined;
  const annotationResources = createReviewAnnotationResourceRetention({
    readDurableReferences: async () => {
      const saved = await deps.readVideoWorkspace(initial.workspace.aggregateId);
      return saved ? collectReviewAssetReferences(saved.workspace) : new Set<string>();
    },
  });
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };
  const identity = () => ({
    aggregateId: state.snapshot.workspace.aggregateId,
    expectedRevision: state.snapshot.workspace.revision,
    expectedSourceAssetId: state.snapshot.workspace.sourceAssetId,
  });
  const captures = new Map<AutosaveKey, () => AutosaveCapture>();
  const coordinator = createAutosaveCoordinator<AutosaveKey, AutosaveCapture>({
    now: () => Date.now(),
    schedule: (callback, delay) => {
      const timer = setTimeout(callback, delay);
      return () => clearTimeout(timer);
    },
    capture: (key) => {
      const capture = captures.get(key);
      if (!capture) throw new Error('Review autosave buffer is unavailable.');
      return capture();
    },
    commit: async (captured) => {
      try {
        const change = captured.change;
        if (change.kind === 'content') {
          const content = loadQuickEditAdvancedContentState(change.content);
          if (!content) throw new Error('Advanced content is invalid.');
          const operation = createReviewAdvancedContentOperation({
            id: crypto.randomUUID(),
            at: Date.now(),
            before: state.document.advancedContent,
            after: content,
          });
          if (operation) {
            await execute(() => deps.commitVideoWorkspace({ ...identity(), operation }), {
              kind: 'commit',
              operation,
              consumeDraft: false,
            });
          }
        } else if (change.kind === 'advanced') {
          await execute(
            () => deps.saveVideoWorkspaceAdvanced({ ...identity(), advanced: change.advanced }),
            change
          );
        } else {
          await execute(
            () =>
              deps.saveVideoWorkspaceDraft({
                ...identity(),
                annotation: change.annotation,
                before: change.before,
                expectedDraftRevision: state.snapshot.draft?.revision ?? null,
              }),
            change
          );
        }
      } catch (error) {
        captured.fail(error);
        throw error;
      }
      captured.acknowledge();
    },
    classifyFailure: (error) => (failureCode(error) === 'storage' ? 'retry' : 'stop'),
  });
  async function persistBuffer() {
    if (state.dirty) {
      const snapshot = await deps.saveVideoWorkspaceSnapshot(
        reviewSnapshotSaveRequest(durable, state.snapshot)
      );
      durable = snapshot;
      state = { ...state, snapshot, dirty: false };
    }
    try {
      await annotationResources.reconcile(
        collectReviewAssetReferences(state.snapshot.workspace),
        true
      );
    } catch (error) {
      state = { ...state, dirty: true };
      throw error;
    }
    return state.snapshot;
  }
  async function transition(
    action: () => Promise<VideoWorkspaceSnapshot>,
    local?: LocalReviewChange,
    speechSaveKey?: string
  ) {
    try {
      if (disposed) throw new Error('Review session is closed.');
      if (local && (!state.autosaveEnabled || (state.dirty && local.kind !== 'reset'))) {
        const snapshot = applyLocalReviewChange(state.snapshot, local);
        state = { ...state, snapshot, document: project(snapshot), dirty: true };
        if (!state.autosaveEnabled) {
          await annotationResources.reconcile(
            collectReviewAssetReferences(snapshot.workspace),
            false
          );
          return snapshot;
        }
        const committed = await persistBuffer();
        state = { ...state, snapshot: committed, document: project(committed), error: null };
        return committed;
      }
      const snapshot = await action();
      if (!local && state.dirty && !state.autosaveEnabled) return snapshot;
      durable = snapshot;
      failedSpeechSave = undefined;
      state = { ...state, snapshot, document: project(snapshot), dirty: false, error: null };
      try {
        await annotationResources.reconcile(collectReviewAssetReferences(snapshot.workspace), true);
      } catch (error) {
        state = { ...state, dirty: true };
        throw error;
      }
      return snapshot;
    } catch (error) {
      failedHistory = local?.kind === 'history';
      if (!speechSaveKey || !state.error || failedSpeechSave === speechSaveKey)
        failedSpeechSave = speechSaveKey;
      state = { ...state, error: failureCode(error) };
      if (state.error !== 'storage') coordinator.suspend(error);
      throw error;
    } finally {
      state = { ...state, pending: state.pending - 1 };
      emit();
    }
  }
  function execute(
    action: () => Promise<VideoWorkspaceSnapshot>,
    local?: LocalReviewChange,
    speechSaveKey?: string
  ) {
    state = { ...state, pending: state.pending + 1 };
    emit();
    return transition(action, local, speechSaveKey);
  }
  function enqueue(
    action: () => Promise<VideoWorkspaceSnapshot>,
    local?: LocalReviewChange,
    speechSaveKey?: string
  ) {
    if (disposed) return Promise.reject(new Error('Review session is closed.'));
    state = { ...state, pending: state.pending + 1 };
    emit();
    return coordinator.runOrdered(() => transition(action, local, speechSaveKey));
  }
  return {
    getSnapshot: () => state,
    /** Registers a lazy buffer capture; scheduling and admission belong to this session. */
    stageAutosave(key: AutosaveKey, capture: () => AutosaveCapture, policy: AutosavePolicy) {
      if (disposed) return;
      captures.set(key, capture);
      coordinator.request(key, policy);
    },
    /** A captured barrier does not claim newer edits or imply a durable write while paused. */
    flushAutosave: (keys?: Iterable<AutosaveKey>) => coordinator.flushCaptured(keys),
    cancelAutosave(key: AutosaveKey) {
      coordinator.cancel(key);
      captures.delete(key);
    },
    ...reviewDurableWorkspaceAccess(
      initial.workspace.aggregateId,
      deps.readVideoWorkspace,
      project
    ),
    setAutosaveEnabled(enabled: boolean) {
      if (disposed) return;
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
    /** Transfers leases only after atomic local admission; a failed Save retains authored content and retry. */
    applyAnnotationEffect(args: {
      expectedSourceAssetId: string;
      snapshot: ReviewAnnotationEffectSnapshot;
      instance: ReviewAnnotationEffect;
      resources: readonly ReviewPreparedAnnotationResource[];
      signal?: AbortSignal;
    }) {
      const captured = structuredClone({
        snapshot: args.snapshot,
        instance: args.instance,
        expectedSourceAssetId: args.expectedSourceAssetId,
      });
      const resources = [...args.resources];
      const signal = args.signal;
      return enqueue(async () => {
        signal?.throwIfAborted();
        if (captured.expectedSourceAssetId !== state.snapshot.workspace.sourceAssetId)
          throw new Error('Annotation source changed.');
        const before = state.document.advancedContent;
        const existing = before.annotationEffects?.instances ?? [];
        if (existing.some((instance) => instance.id === captured.instance.id))
          throw new Error('Annotation instance already exists.');
        const instance = {
          ...captured.instance,
          order: Math.max(-1, ...existing.map((value) => value.order)) + 1,
        };
        const operation: ReviewOperation = {
          id: crypto.randomUUID(),
          at: Date.now(),
          target: 'advancedContent',
          before,
          after: {
            ...before,
            annotationEffects: {
              enabled: before.annotationEffects?.enabled ?? true,
              instances: [...existing, instance],
            },
          },
        };
        const snapshot = applyLocalReviewChange(state.snapshot, {
          kind: 'commit',
          operation,
          consumeDraft: false,
          effectSnapshots: [captured.snapshot],
        });
        annotationResources.admit(
          resources,
          new Set(captured.snapshot.assets.map((asset) => asset.assetId))
        );
        state = { ...state, snapshot, document: project(snapshot), dirty: true };
        if (state.autosaveEnabled) return persistBuffer();
        await annotationResources.reconcile(
          collectReviewAssetReferences(snapshot.workspace),
          false
        );
        return snapshot;
      });
    },
    /** Lets acquisition distinguish transferred leases from an admission failure without mutating them. */
    ownsAnnotationResource: annotationResources.has,
    /** Local preview/export reads use only admitted leases; publication uses the canonical reader. */
    async readAnnotationResource(reference: string, signal: AbortSignal) {
      signal.throwIfAborted();
      return disposed ? null : annotationResources.read(reference, signal);
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
      for (const key of captures.keys()) coordinator.cancel(key);
      captures.clear();
      return enqueue(async () => {
        const snapshot = await deps.readVideoWorkspace(initial.workspace.aggregateId);
        if (!snapshot) throw new Error('Review session is unavailable.');
        state = { ...state, dirty: false };
        coordinator.resume();
        return snapshot;
      });
    },
    async flush(options?: { retryHistory: true }) {
      if (disposed) return;
      const hadPending = state.pending > 0;
      await coordinator.flushCaptured();
      await coordinator.runOrdered(async () => undefined);
      // Only a completed history failure may be retried; pending/content failures stay strict.
      if (state.error && !(options?.retryHistory && failedHistory && !hadPending))
        throw new Error(`Review ${state.error}.`);
    },
    /** Only the mounted source owner disposes the session; beforeunload cancellation leaves it alive. */
    dispose(): Promise<void> {
      if (disposal) return disposal;
      disposed = true;
      for (const key of captures.keys()) coordinator.cancel(key);
      captures.clear();
      disposal = coordinator
        .runOrdered(() => annotationResources.dispose())
        .finally(() => coordinator.dispose());
      return disposal;
    },
  };
}

/** Read-only persisted history/byte/clip admission; it owns no session state, queue or writes. */
function reviewDurableWorkspaceAccess(
  aggregateId: string,
  read: typeof persistence.readVideoWorkspace,
  project: (snapshot: VideoWorkspaceSnapshot) => ReturnType<typeof replayReviewHistory>
) {
  return {
    /** Exact history receipt, including Undo entries; missing authority never implies failure to commit. */
    async readRetainedReviewOperation(id: string) {
      const saved = await read(aggregateId);
      if (!saved) throw new Error('Review session is unavailable.');
      return structuredClone(
        saved.workspace.history.find((operation) => operation.id === id) ?? null
      );
    },
    async hasRetainedVoiceoverClip(clipId: string, assetId: string) {
      const saved = await read(aggregateId);
      if (!saved) throw new Error('Review session is unavailable.');
      return reviewWorkspaceHasAudioClip(saved.workspace, clipId, assetId);
    },
    async hasRetainedAssetReference(assetId: string) {
      const saved = await read(aggregateId);
      if (!saved) throw new Error('Review session is unavailable.');
      return collectReviewAssetReferences(saved.workspace).has(assetId);
    },
    async hasDurableVoiceoverClip(clipId: string, assetId: string) {
      const saved = await read(aggregateId);
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
      const saved = await read(aggregateId);
      return (
        !!saved &&
        reviewWorkspaceHasSpeechReplacement(saved.workspace, target, replacementId, assetId)
      );
    },
  };
}
