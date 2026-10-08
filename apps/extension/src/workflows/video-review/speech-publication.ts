import {
  AUDIO_STAGING_TTL_MS,
  type AudioJobScope,
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
import { runReviewSpeechJob } from './speech-client';
import { decodeReviewSpeechDuration } from './speech-audio';

export type ReviewSpeechSession = ReturnType<typeof createVideoReviewSession>;
export interface ReviewSpeechPreview {
  replacement: ReviewSpeechReplacement;
  blob: Blob;
  url: string;
  scope: AudioJobScope;
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
): AudioJobScope {
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
    const blob = await readAudioStaging(result.staged, scope);
    const duration = await decodeReviewSpeechDuration(blob);
    signal.throwIfAborted();
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

/** Private assets become owned only after the complete replacement batch is durable. */
export async function applyReviewSpeech(
  session: ReviewSpeechSession,
  target: ReviewSpeechTarget,
  previews: readonly ReviewSpeechPreview[],
  signal: AbortSignal,
  options: { originalVolume?: number } = {}
): Promise<void> {
  if (!previews.length) return;
  if (
    target.kind === 'original' &&
    options.originalVolume !== undefined &&
    (!Number.isFinite(options.originalVolume) ||
      options.originalVolume < 0 ||
      options.originalVolume > 1)
  )
    throw new Error('invalid-request');
  signal.throwIfAborted();
  await session.flush();
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
  const initial = applyReviewSpeechReplacements(
    clip.transcript,
    previews.map((preview) =>
      target.kind === 'original'
        ? { ...preview.replacement, enabled: true, originalVolume: options.originalVolume ?? 0 }
        : preview.replacement
    )
  );
  if (!initial.ok) throw new Error(initial.reason);
  const prepared: Awaited<ReturnType<typeof prepareProjectAsset>>[] = [];
  let committed = false;
  try {
    for (const preview of previews) {
      signal.throwIfAborted();
      prepared.push(
        await prepareProjectAsset(
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
              target,
              replacementId: preview.replacement.id,
            },
          }
        )
      );
    }
    const attach = async () => {
      for (const asset of prepared) {
        signal.throwIfAborted();
        await asset.protect();
      }
      signal.throwIfAborted();
      if (
        previews.some(
          (preview) =>
            Date.now() >= preview.expiresAt ||
            preview.geometry !== reviewSpeechGeometry(session, target)
        )
      )
        throw new Error('stale');
      const current = getReviewSpeechTarget(session, target).transcript;
      if (!current) throw new Error('stale');
      const applied = applyReviewSpeechReplacements(
        current,
        previews.map((preview, index) => ({
          ...preview.replacement,
          ...(target.kind === 'original'
            ? { enabled: true, originalVolume: options.originalVolume ?? 0 }
            : {}),
          assetId: `project-asset:${prepared[index]!.id}`,
        }))
      );
      if (!applied.ok) throw new Error(applied.reason);
      await saveReviewSpeechTranscript(session, target, applied.transcript);
      committed = true;
      for (const asset of prepared) await asset.publish();
    };
    const lock = (index: number): Promise<void> =>
      index === prepared.length
        ? attach()
        : withVoiceoverAttachmentLock(`project-asset:${prepared[index]!.id}`, () =>
            lock(index + 1)
          );
    await lock(0);
  } finally {
    if (!committed)
      for (const [index, asset] of prepared.entries()) {
        let retained = true;
        try {
          retained = await session.hasDurableSpeechAsset(
            target,
            previews[index]!.replacement.id,
            `project-asset:${asset.id}`
          );
        } catch {
          /* Preserve ambiguous durable outcomes for recovery. */
        }
        if (!retained) await asset.cancel();
      }
  }
}
