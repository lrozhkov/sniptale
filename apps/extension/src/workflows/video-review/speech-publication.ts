import {
  AUDIO_STAGING_TTL_MS,
  type AudioJobScope,
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
export function reviewSpeechGeometry(session: ReviewSpeechSession, clipId: string): string {
  const { transcript: _transcript, ...clip } = getReviewSpeechClip(session, clipId);
  return JSON.stringify([clip, session.getSnapshot().document.edits]);
}
export function reviewSpeechScope(
  session: ReviewSpeechSession,
  clipId: string,
  start: number,
  end: number
): AudioJobScope {
  const state = session.getSnapshot();
  return {
    workspaceId: state.snapshot.workspace.aggregateId,
    workspaceRevision: state.snapshot.workspace.revision,
    clipId,
    assetId: getReviewSpeechClip(session, clipId).assetId,
    nativeStart: start,
    nativeEnd: end,
  };
}
/** Writes transcript and audio placement together through the existing review history. */
export async function saveReviewSpeechTranscript(
  session: ReviewSpeechSession,
  clipId: string,
  transcript: ReviewSpeechTranscript
): Promise<void> {
  const clip = getReviewSpeechClip(session, clipId);
  await session.saveSpeechTranscript(clipId, clip.assetId, transcript);
}
export async function generateReviewSpeech(
  session: ReviewSpeechSession,
  clipId: string,
  phraseId: string,
  profile: ReviewSpeechProfile,
  signal: AbortSignal
): Promise<ReviewSpeechPreview> {
  signal.throwIfAborted();
  const transcript = getReviewSpeechClip(session, clipId).transcript;
  if (!transcript) throw new Error('stale');
  await saveReviewSpeechTranscript(session, clipId, { ...transcript, profile });
  signal.throwIfAborted();
  const phrase = getReviewSpeechClip(session, clipId).transcript?.phrases.find(
    (entry) => entry.id === phraseId
  );
  if (!phrase) throw new Error('stale');
  const scope = reviewSpeechScope(session, clipId, phrase.start, phrase.end);
  const geometry = reviewSpeechGeometry(session, clipId);
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
    if (Date.now() >= expiresAt) throw new Error('stale');
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
  clipId: string,
  previews: readonly ReviewSpeechPreview[],
  signal: AbortSignal
): Promise<void> {
  if (!previews.length) return;
  signal.throwIfAborted();
  await session.flush();
  const clip = getReviewSpeechClip(session, clipId);
  if (
    !clip.transcript ||
    previews.some(
      (preview) =>
        Date.now() >= preview.expiresAt ||
        preview.geometry !== reviewSpeechGeometry(session, clipId) ||
        preview.scope.clipId !== clipId ||
        preview.scope.assetId !== clip.assetId ||
        preview.scope.workspaceId !== session.getSnapshot().snapshot.workspace.aggregateId
    )
  )
    throw new Error('stale');
  const initial = applyReviewSpeechReplacements(
    clip.transcript,
    previews.map((preview) => preview.replacement)
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
          { aggregateId: preview.scope.workspaceId, clipId },
          { publishToLibrary: false }
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
            preview.geometry !== reviewSpeechGeometry(session, clipId)
        )
      )
        throw new Error('stale');
      const current = getReviewSpeechClip(session, clipId).transcript;
      if (!current) throw new Error('stale');
      const applied = applyReviewSpeechReplacements(
        current,
        previews.map((preview, index) => ({
          ...preview.replacement,
          assetId: `project-asset:${prepared[index]!.id}`,
        }))
      );
      if (!applied.ok) throw new Error(applied.reason);
      await saveReviewSpeechTranscript(session, clipId, applied.transcript);
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
      for (const asset of prepared) {
        let retained = true;
        try {
          retained = await session.hasDurableSpeechAsset(clipId, `project-asset:${asset.id}`);
        } catch {
          /* Preserve ambiguous durable outcomes for recovery. */
        }
        if (!retained) await asset.cancel();
      }
  }
}
