import {
  saveVideoWorkspaceSnapshot,
  commitVideoWorkspace,
  moveVideoWorkspaceHistory,
  readVideoWorkspace,
  saveVideoWorkspaceAdvanced,
  saveVideoWorkspaceDraft,
  saveVideoWorkspaceTyping,
} from '../../composition/persistence/review-workspaces/store';

import type { QuickEditAdvancedContent } from '../../features/video/review/advanced/types';
import type { ReviewAnnotationEffect } from '../../features/video/review/annotation-effects/types';
import type { ReviewOperation } from '../../features/video/review/types';
import type { ReviewSpeechPublicationChange } from './speech-publication-state';
import { parseReviewOriginalSpeechTranscript } from '../../features/video/review/original-speech';
import { parseReviewSpeechTranscript } from '../../features/video/review/speech-validation';
import type { Failure, ReviewDurableAttempt } from './session-types';
import {
  collectReviewAssetReferences,
  reviewWorkspaceHasAudioClip,
  reviewWorkspaceHasSpeechReplacement,
} from '../../composition/persistence/review-workspaces/asset-refs';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { replayReviewHistory, reviewDocumentBaseline } from '../../features/video/review/document';
import type { ReviewSpeechTarget } from '../../contracts/ai/audio';

/** Default persistence adapter; the session factory still accepts an explicit injected adapter. */
export const reviewSessionPersistence = {
  saveVideoWorkspaceSnapshot,
  commitVideoWorkspace,
  moveVideoWorkspaceHistory,
  readVideoWorkspace,
  saveVideoWorkspaceAdvanced,
  saveVideoWorkspaceDraft,
  saveVideoWorkspaceTyping,
};

/** Read-only persisted history/byte/clip admission; it owns no session state, queue or writes. */
export function reviewDurableWorkspaceAccess(
  aggregateId: string,
  read: typeof readVideoWorkspace,
  project: (snapshot: VideoWorkspaceSnapshot) => ReturnType<typeof replayReviewHistory>
) {
  return {
    /** Exact history receipt, including Undo entries; missing authority never implies failure to commit. */
    async readRetainedReviewOperation(id: string, baseRevision?: number) {
      const saved = await read(aggregateId);
      if (!saved) throw new Error('Review session is unavailable.');
      const operation = saved.workspace.history.find((operation) => operation.id === id);
      if (
        !operation &&
        saved.workspace.formatVersion === 2 &&
        saved.workspace.revision !== baseRevision
      )
        throw new Error('stale');
      return structuredClone(operation ?? null);
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

/** Classifies persistence rejection values without admitting an arbitrary boundary code. */
export function failureCode(error: unknown): Failure {
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
export function saveExplicitReviewBuffer(
  state: { error: Failure | null; dirty: boolean },
  save: () => Promise<VideoWorkspaceSnapshot>
) {
  if (state.error && !state.dirty) throw new Error(`Review ${state.error}.`);
  return save();
}

/** Both Save and Reset compare against the last durable snapshot, including its draft revision. */
export function reviewSnapshotSaveRequest(
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

/** Projects a canonical workspace without retaining session state or repairing storage. */
export function projectReviewWorkspace(snapshot: VideoWorkspaceSnapshot) {
  return replayReviewHistory(
    snapshot.workspace.history,
    snapshot.workspace.cursor,
    snapshot.workspace.source,
    reviewDocumentBaseline(snapshot.workspace)
  );
}

/** Captures immutable speech metadata before the session admits receipt and publication state. */
export function captureReviewSpeechPublicationChanges(
  changes: readonly ReviewSpeechPublicationChange[]
) {
  return structuredClone(changes).map((change) => {
    const transcript =
      change.target.kind === 'original'
        ? parseReviewOriginalSpeechTranscript(change.transcript)
        : parseReviewSpeechTranscript(change.transcript);
    if (!transcript) throw new Error('Invalid speech transcript.');
    return { ...change, transcript };
  });
}

/** Admits a durable publication receipt; absence is usable only with exact revision evidence. */
export function reviewPublicationReceiptAccepted(
  canonical: Readonly<VideoWorkspaceSnapshot>,
  durable: Readonly<VideoWorkspaceSnapshot>,
  operation: Readonly<ReviewOperation>,
  baseRevision: number,
  failedAttempt: Readonly<ReviewDurableAttempt>
): boolean {
  if (
    canonical.workspace.aggregateId !== durable.workspace.aggregateId ||
    canonical.workspace.sourceAssetId !== durable.workspace.sourceAssetId ||
    JSON.stringify(canonical.workspace.source) !== JSON.stringify(durable.workspace.source)
  )
    throw new Error('stale');
  const accepted = canonical.workspace.history.find((entry) => entry.id === operation.id);
  if (!accepted) {
    const confirmedAbsent =
      failedAttempt?.id === operation.id &&
      failedAttempt.baseRevision === baseRevision &&
      failedAttempt.confirmedAbsentRevision === canonical.workspace.revision &&
      JSON.stringify(canonical) === JSON.stringify(durable);
    if (
      (!confirmedAbsent && canonical.workspace.revision !== baseRevision) ||
      canonical.workspace.sourceAssetId !== durable.workspace.sourceAssetId
    )
      throw new Error('stale');
    return false;
  }
  if (
    canonical.workspace.revision <= baseRevision ||
    JSON.stringify(accepted) !== JSON.stringify(operation)
  )
    throw new Error('stale');
  return true;
}

/** Binds every ordinary workspace write to its current source and aggregate CAS revision. */
export function reviewWriteIdentity(snapshot: Readonly<VideoWorkspaceSnapshot>) {
  return {
    aggregateId: snapshot.workspace.aggregateId,
    expectedRevision: snapshot.workspace.revision,
    expectedSourceAssetId: snapshot.workspace.sourceAssetId,
  };
}

/** Builds an admitted annotation operation before any lease transfer or workspace mutation. */
export function createReviewAnnotationPublication(
  before: QuickEditAdvancedContent,
  candidate: ReviewAnnotationEffect
): ReviewOperation {
  const existing = before.annotationEffects?.instances ?? [];
  if (existing.some((instance) => instance.id === candidate.id))
    throw new Error('Annotation instance already exists.');
  const instance = {
    ...candidate,
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
  return operation;
}
