import type { ReviewSpeechTarget } from '../../contracts/ai/audio';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import type { QuickEditAdvancedContent } from '../../features/video/review/advanced/types';
import type { ReviewDocument, ReviewOperation } from '../../features/video/review/types';
import type { ReviewSpeechTranscript } from '../../features/video/review/speech-transcript';
import { applyLocalReviewChange, prepareReviewSpeechTranscriptChange } from './local-session';
import { replayReviewHistory, reviewDocumentBaseline } from '../../features/video/review/document';

export interface ReviewSpeechPublicationChange {
  target: ReviewSpeechTarget;
  expectedAssetId: string;
  geometry: string;
  transcriptBasis: string;
  transcript: ReviewSpeechTranscript;
}

export interface ReviewSpeechPublicationReceipt {
  readonly id: string;
  readonly at: number;
}

/** The same sample placement basis is checked again inside the session's ordered queue. */
export function reviewSpeechPublicationBasis(
  snapshot: VideoWorkspaceSnapshot,
  document: ReviewDocument,
  target: ReviewSpeechTarget
) {
  const clip =
    target.kind === 'voiceover'
      ? document.advancedContent.audio.voiceover.find((entry) => entry.id === target.clipId)
      : undefined;
  if (target.kind === 'voiceover' && !clip) throw new Error('stale');
  const transcript =
    target.kind === 'original'
      ? document.advancedContent.audio.originalSpeech?.transcript
      : clip?.transcript;
  const geometry = clip
    ? (() => {
        const { transcript: _transcript, ...placement } = clip;
        return placement;
      })()
    : {
        assetId: snapshot.workspace.sourceAssetId,
        nativeStart: 0,
        nativeEnd: snapshot.workspace.source.duration,
      };
  return {
    expectedAssetId: clip?.assetId ?? snapshot.workspace.sourceAssetId,
    geometry: JSON.stringify([target, geometry, document.edits]),
    transcriptBasis: JSON.stringify(transcript ?? null),
  };
}

export function prepareReviewSpeechPublication(
  snapshot: VideoWorkspaceSnapshot,
  document: ReviewDocument,
  changes: readonly ReviewSpeechPublicationChange[],
  receipt: ReviewSpeechPublicationReceipt
): Extract<ReviewOperation, { target: 'advancedContent' }> | null {
  let content = document.advancedContent;
  const targets = new Set<string>();
  for (const change of changes) {
    const key = JSON.stringify(change.target);
    if (targets.has(key)) throw new Error('Invalid duplicate speech target.');
    targets.add(key);
    const basis = reviewSpeechPublicationBasis(snapshot, document, change.target);
    if (
      basis.expectedAssetId !== change.expectedAssetId ||
      basis.geometry !== change.geometry ||
      basis.transcriptBasis !== change.transcriptBasis
    )
      throw new Error('stale');
    content =
      prepareReviewSpeechTranscriptChange(
        content,
        change.target,
        snapshot.workspace.sourceAssetId,
        change.expectedAssetId,
        change.transcript
      )?.after ?? content;
  }
  return JSON.stringify(content) === JSON.stringify(document.advancedContent)
    ? null
    : {
        ...receipt,
        target: 'advancedContent',
        before: document.advancedContent,
        after: content,
      };
}

export type ReviewPublicationFields =
  | { kind: 'text' }
  | { kind: 'speech'; targets: readonly ReviewSpeechTarget[] };

function adoptPublicationFields(
  content: QuickEditAdvancedContent,
  before: QuickEditAdvancedContent,
  current: QuickEditAdvancedContent,
  fields: ReviewPublicationFields
): QuickEditAdvancedContent {
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  if (fields.kind === 'text') {
    if (!same(content.text, before.text))
      throw new Error('Review publication conflicts with local text.');
    const { text: _text, ...rest } = content;
    return { ...rest, ...(current.text ? { text: current.text } : {}) };
  }
  let audio = content.audio;
  for (const target of fields.targets) {
    if (target.kind === 'original') {
      if (!same(audio.originalSpeech, before.audio.originalSpeech))
        throw new Error('Review publication conflicts with local speech.');
      const { originalSpeech: _speech, ...rest } = audio;
      audio = {
        ...rest,
        ...(current.audio.originalSpeech ? { originalSpeech: current.audio.originalSpeech } : {}),
      };
    } else {
      const oldClip = before.audio.voiceover.find((entry) => entry.id === target.clipId);
      const currentClip = current.audio.voiceover.find((entry) => entry.id === target.clipId);
      const localClip = audio.voiceover.find((entry) => entry.id === target.clipId);
      if (!oldClip || !currentClip || !same(localClip, oldClip))
        throw new Error('Review publication conflicts with local speech placement.');
      audio = {
        ...audio,
        voiceover: audio.voiceover.map((entry) =>
          entry.id === target.clipId ? currentClip : entry
        ),
      };
    }
  }
  return { ...content, audio };
}

/** Rebase only the untouched publication fields in uncommitted append-only local actions. */
export function rebaseReviewPublicationBuffer(
  durable: VideoWorkspaceSnapshot,
  local: VideoWorkspaceSnapshot,
  canonical: VideoWorkspaceSnapshot,
  fields: ReviewPublicationFields
): VideoWorkspaceSnapshot {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const old = durable.workspace;
  const pending = local.workspace;
  const next = canonical.workspace;
  if (
    old.aggregateId !== next.aggregateId ||
    old.sourceAssetId !== next.sourceAssetId ||
    !same(old.source, next.source) ||
    old.cursor !== old.history.length ||
    pending.cursor !== pending.history.length ||
    !same(old.baseline, pending.baseline) ||
    !same(old.history, pending.history.slice(0, old.history.length))
  )
    throw new Error('Review publication conflicts with local history.');
  const project = (snapshot: VideoWorkspaceSnapshot) =>
    replayReviewHistory(
      snapshot.workspace.history,
      snapshot.workspace.cursor,
      snapshot.workspace.source,
      reviewDocumentBaseline(snapshot.workspace)
    );
  const before = project(durable).advancedContent;
  const current = project(canonical).advancedContent;
  // A changed local projection of the publication target must never be silently overwritten.
  adoptPublicationFields(project(local).advancedContent, before, current, fields);
  let rebased = canonical;
  for (const operation of pending.history.slice(old.history.length)) {
    if (operation.target === 'edit')
      throw new Error('Review publication conflicts with local timing.');
    const adopted =
      operation.target === 'advancedContent'
        ? {
            ...operation,
            before: adoptPublicationFields(operation.before, before, current, fields),
            after: adoptPublicationFields(operation.after, before, current, fields),
          }
        : operation;
    rebased = applyLocalReviewChange(rebased, {
      kind: 'commit',
      operation: adopted,
      consumeDraft: false,
      ...(adopted.target === 'advancedContent' && pending.effectSnapshots
        ? { effectSnapshots: pending.effectSnapshots }
        : {}),
    });
  }
  if (!same(local.draft, durable.draft) && !same(canonical.draft, durable.draft))
    throw new Error('Review publication conflicts with local draft.');
  let advanced = {
    ...rebased.workspace.advanced,
    ui: same(pending.advanced.ui, old.advanced.ui)
      ? rebased.workspace.advanced.ui
      : pending.advanced.ui,
  };
  if (!same(pending.advanced.recoveryV1, old.advanced.recoveryV1)) {
    const { recoveryV1: _recovery, ...rest } = advanced;
    advanced = {
      ...rest,
      ...(pending.advanced.recoveryV1 ? { recoveryV1: pending.advanced.recoveryV1 } : {}),
    };
  }
  return {
    workspace: { ...rebased.workspace, advanced },
    draft: same(local.draft, durable.draft) ? canonical.draft : local.draft,
  };
}
