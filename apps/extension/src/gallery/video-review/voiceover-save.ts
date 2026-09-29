import type { AudioTrimRange } from '../../composition/audio-recording/session-types';
import { anchorReviewVoiceover } from '../../features/video/review/voiceover-edits';
import { translate } from '../../platform/i18n';
import {
  importReviewAudio,
  importedAudioClip,
  type PreparedReviewAudio,
} from '../../workflows/video-review/audio-import';
import type { createVideoReviewSession } from '../../workflows/video-review/session';
import type { useReviewAudio } from './use-review-audio';

type ReviewSession = ReturnType<typeof createVideoReviewSession>;

/** Publishes a retained take and adds its clip to the review exactly once. */
export async function saveReviewVoiceoverTake(args: {
  file: File;
  trim: AudioTrimRange;
  signal: AbortSignal;
  take: Blob;
  outputStart: number | null;
  resultDuration: number;
  audio: ReturnType<typeof useReviewAudio>;
  session: ReviewSession;
  takeIds: WeakMap<Blob, string>;
  preparedTakes: WeakMap<Blob, PreparedReviewAudio>;
  isCurrent(): boolean;
  flushAdvanced(): Promise<void>;
}): Promise<void> {
  if (args.signal.aborted) return;
  let clipId = args.takeIds.get(args.take);
  if (!clipId) {
    clipId = `audio-${crypto.randomUUID()}`;
    args.takeIds.set(args.take, clipId);
  }
  if (args.outputStart === null) throw new Error(translate('gallery.videoReview.placementOnCut'));
  if (!args.isCurrent()) throw new Error('Recording review changed');
  const snapshot = () => args.session.getSnapshot();
  const attached = (assetId?: string) =>
    snapshot().document.advancedContent.audio.voiceover.some(
      (clip) => clip.id === clipId && (!assetId || clip.assetId === assetId)
    );
  const markAttached = (assetId: string, duration: number) => {
    const clip = snapshot().document.advancedContent.audio.voiceover.find(
      (item) => item.id === clipId && item.assetId === assetId
    );
    if (clip && !args.signal.aborted && args.isCurrent())
      args.audio.markImported(clip, duration, args.file.name);
  };
  if (attached()) {
    const prepared = args.preparedTakes.get(args.take);
    if (!prepared || !attached(prepared.assetId))
      throw new Error('Recording publication cannot be resumed');
    await prepared.publish();
    markAttached(prepared.assetId, prepared.duration);
    args.preparedTakes.delete(args.take);
    return;
  }
  const placement = args.outputStart + args.trim.trimStart;
  await args.flushAdvanced();
  await importReviewAudio({
    file: args.file,
    signal: args.signal,
    requiredReview: {
      aggregateId: snapshot().snapshot.workspace.aggregateId,
      clipId,
    },
    assertCurrentTarget: () => {
      if (!args.isCurrent()) throw new Error('Recording review changed');
      if (placement >= args.resultDuration)
        throw new Error(translate('gallery.videoReview.placementOnCut'));
    },
    hasDurableReference: (assetId) =>
      attached(assetId) || args.session.hasDurableVoiceoverClip(clipId, assetId),
    onPrepared: (prepared) => args.preparedTakes.set(args.take, prepared),
    attach: (assetId, duration) =>
      commitRecordedClip(args.session, clipId, assetId, duration, placement, args.resultDuration),
  });
  const prepared = args.preparedTakes.get(args.take);
  if (prepared) {
    markAttached(prepared.assetId, prepared.duration);
    args.preparedTakes.delete(args.take);
  }
}

async function commitRecordedClip(
  session: ReviewSession,
  clipId: string,
  assetId: string,
  duration: number,
  placement: number,
  resultDuration: number
): Promise<void> {
  const before = session.getSnapshot().document.advancedContent;
  if (before.audio.voiceover.some((clip) => clip.id === clipId && clip.assetId === assetId)) return;
  const clip = { ...importedAudioClip(assetId, duration, placement, resultDuration), id: clipId };
  const anchored = before.audio.voiceoverSegments
    ? anchorReviewVoiceover(clip, before.audio.voiceoverSegments)
    : clip;
  try {
    await session.commitDurable({
      id: crypto.randomUUID(),
      at: Date.now(),
      target: 'advancedContent',
      before,
      after: {
        ...before,
        audio: { ...before.audio, voiceover: [...before.audio.voiceover, anchored] },
      },
    });
  } catch (error) {
    if (await session.hasDurableVoiceoverClip(clipId, assetId)) await session.reload();
    throw error;
  }
}
