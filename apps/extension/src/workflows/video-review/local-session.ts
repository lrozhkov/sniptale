import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { ReviewSpeechTarget } from '../../contracts/ai/audio';
import { parseReviewOriginalSpeechTranscript } from '../../features/video/review/original-speech';
import { parseReviewSpeechTranscript } from '../../features/video/review/speech-validation';
import type { ReviewSpeechTranscript } from '../../features/video/review/speech-transcript';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { pruneReviewAnnotationEffectSnapshots } from '../../composition/persistence/review-workspaces/asset-refs';
import { mergeReviewAnnotationEffectSnapshots } from '../../features/video/review/annotation-effects/validation';
import type { ReviewAnnotationEffectSnapshot } from '../../features/video/review/annotation-effects/types';
import {
  parseVideoWorkspace,
  parseVideoWorkspaceDraft,
} from '../../composition/persistence/review-workspaces/parser';
import type {
  ReviewAnnotation,
  ReviewHistoryDirection,
  ReviewOperation,
} from '../../features/video/review/types';

/** Page-local operations use the same canonical snapshot validation as durable recovery. */
export type LocalReviewChange =
  | { kind: 'reset' }
  | { kind: 'advanced'; advanced: unknown }
  | { kind: 'draft'; annotation: ReviewAnnotation | null; before: ReviewAnnotation | null }
  | {
      kind: 'commit';
      operation: ReviewOperation;
      consumeDraft: boolean;
      effectSnapshots?: readonly ReviewAnnotationEffectSnapshot[];
    }
  | { kind: 'history'; direction: ReviewHistoryDirection };

/** Prepares only the content change; the session retains queue, identity and commit ownership. */
export function prepareReviewSpeechTranscriptChange(
  before: Extract<ReviewOperation, { target: 'advancedContent' }>['before'],
  target: ReviewSpeechTarget,
  sourceAssetId: string,
  expectedAssetId: string,
  captured: ReviewSpeechTranscript
): Omit<Extract<ReviewOperation, { target: 'advancedContent' }>, 'id' | 'at'> | null {
  const clip =
    target.kind === 'voiceover'
      ? before.audio.voiceover.find((entry) => entry.id === target.clipId)
      : undefined;
  const assetId = target.kind === 'original' ? sourceAssetId : clip?.assetId;
  if (assetId !== expectedAssetId) throw new Error('Speech target changed.');
  const previous =
    target.kind === 'original' ? before.audio.originalSpeech?.transcript : clip?.transcript;
  if (
    JSON.stringify(
      target.kind === 'original'
        ? parseReviewOriginalSpeechTranscript(previous)
        : parseReviewSpeechTranscript(previous)
    ) === JSON.stringify(captured)
  )
    return null;
  const original =
    target.kind === 'original' ? parseReviewOriginalSpeechTranscript(captured) : null;
  if (target.kind === 'original' && !original) throw new Error('Invalid original transcript.');
  const audio = original
    ? {
        ...before.audio,
        originalSpeech: {
          enabled: before.audio.originalSpeech?.enabled ?? true,
          transcript: original,
        },
      }
    : {
        ...before.audio,
        voiceover: before.audio.voiceover.map((entry) =>
          target.kind === 'voiceover' && entry.id === target.clipId
            ? { ...entry, transcript: captured }
            : entry
        ),
      };
  return { target: 'advancedContent', before, after: { ...before, audio } };
}

/** Derives an editable buffer without advancing either durable revision. */
export function applyLocalReviewChange(
  snapshot: VideoWorkspaceSnapshot,
  change: LocalReviewChange
): VideoWorkspaceSnapshot {
  let { workspace, draft } = snapshot;
  if (change.kind === 'reset') {
    workspace = {
      ...workspace,
      history: [],
      cursor: 0,
      advanced: { ...createQuickEditAdvancedState(), ui: workspace.advanced.ui },
    };
    draft = null;
  } else if (change.kind === 'advanced') {
    const next = parseVideoWorkspace({ ...workspace, advanced: change.advanced });
    if (!next) throw new Error('Invalid review state');
    workspace = next;
  } else if (change.kind === 'draft') {
    draft =
      change.annotation === null
        ? null
        : parseVideoWorkspaceDraft(
            {
              aggregateId: workspace.aggregateId,
              revision: draft?.revision ?? 1,
              annotation: change.annotation,
              before: change.before,
              updatedAt: Date.now(),
            },
            workspace.source.duration
          );
    if (change.annotation !== null && !draft) throw new Error('Invalid review draft');
  } else if (change.kind === 'history') {
    workspace = {
      ...workspace,
      cursor:
        change.direction === 'start'
          ? 0
          : Math.max(
              0,
              Math.min(
                workspace.history.length,
                workspace.cursor + (change.direction === 'undo' ? -1 : 1)
              )
            ),
    };
  } else {
    const merged = change.effectSnapshots
      ? mergeReviewAnnotationEffectSnapshots(
          workspace.effectSnapshots ?? [],
          change.effectSnapshots
        )
      : undefined;
    if (
      merged === null ||
      (change.effectSnapshots && change.operation.target !== 'advancedContent')
    )
      throw new Error('Invalid immutable annotation sources');
    if (
      change.consumeDraft &&
      (!draft ||
        change.operation.target !== 'annotation' ||
        JSON.stringify(change.operation.after) !== JSON.stringify(draft.annotation) ||
        JSON.stringify(change.operation.before) !== JSON.stringify(draft.before))
    ) {
      throw new Error('Review draft is unavailable');
    }
    const operation =
      change.operation.target === 'edit'
        ? {
            ...change.operation,
            preserveFocusAnchors: true as const,
            preserveUnderCuts: true as const,
            preserveVoiceoverAnchors: true as const,
            normalizeVoiceoverTempo: true as const,
          }
        : change.operation;
    workspace = {
      ...workspace,
      ...(merged ? { effectSnapshots: merged } : {}),
      history: [...workspace.history.slice(0, workspace.cursor), operation],
      cursor: workspace.cursor + 1,
    };
    if (change.consumeDraft) draft = null;
  }
  const parsed = parseVideoWorkspace(
    change.kind === 'history' ? workspace : pruneReviewAnnotationEffectSnapshots(workspace)
  );
  if (!parsed) throw new Error('Invalid review workspace');
  return { workspace: parsed, draft };
}
