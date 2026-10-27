import type { AudioTextJobScope } from '../../contracts/ai/audio';
import {
  AUDIO_STAGING_TTL_MS,
  type AudioSourceJobScope,
  type ReviewSpeechTarget,
  sameReviewSpeechTarget,
  type AudioStagedHandle,
} from '../../contracts/ai/audio';
import {
  readAudioStaging,
  discardAudioStaging,
} from '../../composition/persistence/assets/audio-staging';
import { prepareProjectAsset } from '../../composition/persistence/projects';
import { withVoiceoverAttachmentLock } from '../../composition/persistence/projects/voiceover-publication-lock';
import {
  applyReviewSpeechReplacements,
  reviewSpeechTextSignature,
  type ReviewSpeechTranscript,
  type ReviewSpeechProfile,
  type ReviewSpeechReplacement,
} from '../../features/video/review/speech-transcript';
import type { createVideoReviewSession } from './session';
import { runReviewSpeechJob } from '../audio-jobs/client';
import { decodeReviewSpeechDuration } from './speech-audio';
import {
  reviewSpeechPublicationBasis,
  type ReviewSpeechPublicationChange,
  type ReviewSpeechPublicationReceipt,
} from './speech-publication-state';

export type ReviewSpeechSession = ReturnType<typeof createVideoReviewSession>;
export interface ReviewSpeechPreview {
  replacement: ReviewSpeechReplacement;
  blob: Blob;
  url: string;
  scope: AudioSourceJobScope;
  staged: AudioStagedHandle;
  geometry: string;
  createdAt: number;
  expiresAt: number;
}
export function getReviewSpeechClip(session: ReviewSpeechSession, clipId: string) {
  const clip = session
    .getSnapshot()
    .document.advancedContent.audio.voiceover.find((entry) => entry.id === clipId);
  if (!clip) throw new Error('stale');
  return clip;
}
export function getReviewSpeechTarget(session: ReviewSpeechSession, target: ReviewSpeechTarget) {
  if (target.kind === 'voiceover') {
    const clip = getReviewSpeechClip(session, target.clipId);
    return {
      assetId: clip.assetId,
      transcript: clip.transcript,
      nativeStart: clip.sourceOffset,
      nativeEnd: clip.sourceOffset + clip.duration,
    };
  }
  const state = session.getSnapshot();
  return {
    assetId: state.snapshot.workspace.sourceAssetId,
    transcript: state.document.advancedContent.audio.originalSpeech?.transcript,
    nativeStart: 0,
    nativeEnd: state.snapshot.workspace.source.duration,
  };
}
export function reviewSpeechGeometry(
  session: ReviewSpeechSession,
  target: ReviewSpeechTarget
): string {
  const { transcript: _transcript, ...source } = getReviewSpeechTarget(session, target);
  const geometry =
    target.kind === 'voiceover'
      ? (() => {
          const { transcript: _unused, ...clip } = getReviewSpeechClip(session, target.clipId);
          return clip;
        })()
      : source;
  return JSON.stringify([target, geometry, session.getSnapshot().document.edits]);
}
export function reviewSpeechScope(
  session: ReviewSpeechSession,
  target: ReviewSpeechTarget,
  start: number,
  end: number
): AudioSourceJobScope {
  const state = session.getSnapshot();
  return {
    workspaceId: state.snapshot.workspace.aggregateId,
    workspaceRevision: state.snapshot.workspace.revision,
    target,
    assetId: getReviewSpeechTarget(session, target).assetId,
    nativeStart: start,
    nativeEnd: end,
  };
}
/** Writes transcript and audio placement together through the existing review history. */
export async function saveReviewSpeechTranscript(
  session: ReviewSpeechSession,
  target: ReviewSpeechTarget,
  transcript: ReviewSpeechTranscript
): Promise<void> {
  const clip = getReviewSpeechTarget(session, target);
  await session.saveSpeechTranscript(target, clip.assetId, transcript);
}
export async function generateReviewSpeech(
  session: ReviewSpeechSession,
  target: ReviewSpeechTarget,
  phraseId: string,
  profile: ReviewSpeechProfile,
  signal: AbortSignal
): Promise<ReviewSpeechPreview> {
  signal.throwIfAborted();
  const transcript = getReviewSpeechTarget(session, target).transcript;
  if (!transcript) throw new Error('stale');
  await saveReviewSpeechTranscript(session, target, { ...transcript, profile });
  signal.throwIfAborted();
  const phrase = structuredClone(
    getReviewSpeechTarget(session, target).transcript?.phrases.find(
      (entry) => entry.id === phraseId
    )
  );
  if (!phrase) throw new Error('stale');
  const scope = reviewSpeechScope(session, target, phrase.start, phrase.end);
  const geometry = reviewSpeechGeometry(session, target);
  const { modelId, ...parameters } = profile;
  const createdAt = Date.now();
  const expiresAt = createdAt + AUDIO_STAGING_TTL_MS;
  const result = await runReviewSpeechJob(
    {
      type: 'start',
      requestId: crypto.randomUUID(),
      operation: 'speech',
      modelId,
      scope,
      phraseId,
      textRevision: phrase.revision,
      text: phrase.text,
      profile: parameters,
    },
    { signal }
  );
  if (result.type !== 'audio') throw new Error('invalid-response');
  try {
    const { blob, duration } = await readPreparedReviewSpeechAudio(result.staged, scope, signal);
    const current = getReviewSpeechTarget(session, target);
    const currentPhrase = current.transcript?.phrases.find((entry) => entry.id === phraseId);
    if (
      Date.now() >= expiresAt ||
      reviewSpeechGeometry(session, target) !== geometry ||
      current.assetId !== scope.assetId ||
      !currentPhrase ||
      currentPhrase.revision !== phrase.revision ||
      currentPhrase.text !== phrase.text ||
      !current.transcript?.profile ||
      reviewSpeechTextSignature(phrase.text, current.transcript.profile) !==
        reviewSpeechTextSignature(phrase.text, profile)
    )
      throw new Error('stale');
    return {
      blob,
      url: URL.createObjectURL(blob),
      scope,
      staged: result.staged,
      geometry,
      createdAt,
      expiresAt,
      replacement: {
        id: crypto.randomUUID(),
        assetId: `project-asset:preview-${crypto.randomUUID()}`,
        start: phrase.start,
        end: phrase.end,
        phraseId,
        revision: phrase.revision,
        text: phrase.text,
        profile: { ...profile },
        duration,
        textSignature: reviewSpeechTextSignature(phrase.text, profile),
      },
    };
  } catch (error) {
    await discardAudioStaging(result.staged, scope).catch(() => undefined);
    throw error;
  }
}
export async function cleanupReviewSpeechPreview(preview: ReviewSpeechPreview): Promise<void> {
  URL.revokeObjectURL(preview.url);
  await discardAudioStaging(preview.staged, preview.scope);
}

/** The single-target command uses the same all-or-nothing metadata publication as bulk Apply. */
export function applyReviewSpeech(
  session: ReviewSpeechSession,
  target: ReviewSpeechTarget,
  previews: readonly ReviewSpeechPreview[],
  signal: AbortSignal,
  options: { originalVolume?: number } = {}
): Promise<void> {
  return applyReviewSpeechBatch(session, [{ target, previews, ...options }], signal);
}

interface ReviewSpeechApplyGroup {
  target: ReviewSpeechTarget;
  previews: readonly ReviewSpeechPreview[];
  originalVolume?: number;
}
type ReviewSpeechAttachment = {
  identity: string;
  receipt: ReviewSpeechPublicationReceipt;
  prepared: {
    asset: Awaited<ReturnType<typeof prepareProjectAsset>>;
    target: ReviewSpeechTarget;
    preview: ReviewSpeechPreview;
  }[];
  changes?: ReviewSpeechPublicationChange[];
  accepted: boolean;
};
// The existing publication workflow owns disposable handles until required publication completes.
const pendingAttachments = new WeakMap<ReviewSpeechSession, ReviewSpeechAttachment>();

function validateApplyGroup(session: ReviewSpeechSession, group: ReviewSpeechApplyGroup) {
  const { target, previews, originalVolume } = group;
  if (
    target.kind === 'original' &&
    originalVolume !== undefined &&
    (!Number.isFinite(originalVolume) || originalVolume < 0 || originalVolume > 1)
  )
    throw new Error('invalid-request');
  const clip = getReviewSpeechTarget(session, target);
  if (
    !clip.transcript ||
    previews.some(
      (preview) =>
        Date.now() >= preview.expiresAt ||
        preview.geometry !== reviewSpeechGeometry(session, target) ||
        !sameReviewSpeechTarget(preview.scope.target, target) ||
        preview.scope.assetId !== clip.assetId ||
        preview.scope.workspaceId !== session.getSnapshot().snapshot.workspace.aggregateId
    )
  )
    throw new Error('stale');
  const replacements = previews.map((preview) =>
    target.kind === 'original'
      ? { ...preview.replacement, enabled: true, originalVolume: originalVolume ?? 0 }
      : preview.replacement
  );
  const applied = applyReviewSpeechReplacements(clip.transcript, replacements);
  if (!applied.ok) throw new Error(applied.reason);
  return applied.transcript;
}

/** Prepares every target before one durable action; explicit retry finishes the same attachment. */
async function applyReviewSpeechBatch(
  session: ReviewSpeechSession,
  groups: readonly ReviewSpeechApplyGroup[],
  signal: AbortSignal,
  options?: { flushAdvanced(): Promise<void> }
): Promise<void> {
  const selected = groups.filter((group) => group.previews.length > 0);
  if (!selected.length) return;
  signal.throwIfAborted();
  const keys = selected.map((group) => JSON.stringify(group.target));
  if (new Set(keys).size !== keys.length) throw new Error('invalid-request');
  const identity = JSON.stringify(
    selected.map((group) => [
      group.target,
      group.originalVolume,
      group.previews.map((preview) => [
        preview.replacement.id,
        preview.staged.id,
        preview.geometry,
      ]),
    ])
  );
  const previous = pendingAttachments.get(session);
  if (previous && previous.identity !== identity && previous.prepared.length)
    throw new Error('stale');
  const attempt: ReviewSpeechAttachment =
    previous?.identity === identity
      ? previous
      : {
          identity,
          receipt: session.createSpeechPublicationReceipt(),
          prepared: [],
          accepted: false,
        };
  pendingAttachments.set(session, attempt);
  try {
    if (previous?.identity === identity && !attempt.accepted)
      attempt.accepted = await session.recoverSpeechPublication(attempt.receipt);
    if (!attempt.accepted) {
      await options?.flushAdvanced();
      await session.flush();
      await prepareReviewSpeechBatchAssets(session, selected, attempt.prepared, signal);
    }
    const attach = async () => {
      if (!attempt.accepted)
        for (const { asset } of attempt.prepared) {
          signal.throwIfAborted();
          await asset.protect();
        }
      if (!attempt.accepted) {
        signal.throwIfAborted();
        attempt.changes ??= prepareReviewSpeechBatchChanges(session, selected, attempt.prepared);
        await session.publishSpeechTranscripts(attempt.changes, attempt.receipt);
        attempt.accepted = true;
      }
      // Accepted metadata owns these bytes even when cancellation arrives during its acknowledgement.
      for (const { asset } of attempt.prepared) await asset.publish();
    };
    const lockIds = attempt.prepared.map(({ asset }) => `project-asset:${asset.id}`).sort();
    const lock = (index: number): Promise<void> =>
      index === lockIds.length
        ? attach()
        : withVoiceoverAttachmentLock(lockIds[index]!, () => lock(index + 1));
    await lock(0);
    pendingAttachments.delete(session);
  } finally {
    if (!attempt.accepted && attempt.prepared.length) {
      let uncommitted = false;
      try {
        attempt.accepted = await session.recoverSpeechPublication(attempt.receipt, {
          discardUncommittedAttempt: true,
        });
        uncommitted = !attempt.accepted;
      } catch {
        /* Unknown outcomes retain ready handles and their journal for explicit recovery. */
      }
      if (uncommitted) {
        const remaining: ReviewSpeechAttachment['prepared'] = [];
        for (const entry of attempt.prepared) {
          let retained = true;
          try {
            retained = await session.hasDurableSpeechAsset(
              entry.target,
              entry.preview.replacement.id,
              `project-asset:${entry.asset.id}`
            );
          } catch {
            /* A separate reader failure cannot authorize deletion. */
          }
          if (retained) remaining.push(entry);
          else await entry.asset.cancel();
        }
        attempt.prepared = remaining;
        if (!remaining.length) delete attempt.changes;
      }
    }
  }
}

export async function readPreparedReviewSpeechAudio(
  staged: AudioStagedHandle,
  scope: AudioSourceJobScope | AudioTextJobScope,
  signal: AbortSignal
) {
  const blob = await readAudioStaging(staged, scope);
  const duration = await decodeReviewSpeechDuration(blob);
  signal.throwIfAborted();
  return { blob, duration };
}

/** Validates every prepared target and derives the one shared metadata publication. */
function prepareReviewSpeechBatchChanges(
  session: ReviewSpeechSession,
  selected: readonly ReviewSpeechApplyGroup[],
  prepared: ReviewSpeechAttachment['prepared']
): ReviewSpeechPublicationChange[] {
  const state = session.getSnapshot();
  return selected.map((group) => {
    validateApplyGroup(session, group);
    const current = getReviewSpeechTarget(session, group.target).transcript!;
    const applied = applyReviewSpeechReplacements(
      current,
      group.previews.map((preview) => ({
        ...preview.replacement,
        ...(group.target.kind === 'original'
          ? { enabled: true, originalVolume: group.originalVolume ?? 0 }
          : {}),
        assetId: `project-asset:${
          prepared.find(
            (entry) =>
              sameReviewSpeechTarget(entry.target, group.target) &&
              entry.preview.replacement.id === preview.replacement.id &&
              entry.preview.staged.id === preview.staged.id
          )!.asset.id
        }`,
      }))
    );
    if (!applied.ok) throw new Error(applied.reason);
    return {
      target: group.target,
      transcript: applied.transcript,
      ...reviewSpeechPublicationBasis(state.snapshot, state.document, group.target),
    };
  });
}

/** Acquires all selected ready handles before the workflow protects and publishes the batch. */
async function prepareReviewSpeechBatchAssets(
  session: ReviewSpeechSession,
  selected: readonly ReviewSpeechApplyGroup[],
  prepared: ReviewSpeechAttachment['prepared'],
  signal: AbortSignal
): Promise<void> {
  for (const group of selected) validateApplyGroup(session, group);
  for (const group of selected)
    for (const preview of group.previews) {
      if (
        prepared.some(
          (entry) =>
            sameReviewSpeechTarget(entry.target, group.target) &&
            entry.preview.replacement.id === preview.replacement.id &&
            entry.preview.staged.id === preview.staged.id
        )
      )
        continue;
      signal.throwIfAborted();
      const asset = await prepareProjectAsset(
        preview.blob,
        preview.blob.type,
        'speech',
        undefined,
        undefined,
        undefined,
        {
          publishToLibrary: false,
          requiredReviewSpeech: {
            aggregateId: preview.scope.workspaceId,
            target: group.target,
            replacementId: preview.replacement.id,
          },
        }
      );
      prepared.push({ asset, target: group.target, preview });
    }
}
