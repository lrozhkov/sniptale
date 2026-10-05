import type { AudioTrimRange } from '../../composition/audio-recording/session-types';
import type { ReviewTimeSegment } from '../../features/video/review/timeline';
import {
  anchorReviewVoiceover,
  anchorReviewVoiceoverAtSource,
} from '../../features/video/review/voiceover-edits';
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
  onRetained?: () => void;
  sourceStart: number;
  segments: readonly ReviewTimeSegment[];
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
    if (args.onRetained && (await args.session.hasDurableVoiceoverClip(clipId, prepared.assetId)))
      args.onRetained();
    await prepared.publish();
    markAttached(prepared.assetId, prepared.duration);
    args.preparedTakes.delete(args.take);
    return;
  }
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
    },
    hasDurableReference: (assetId) =>
      attached(assetId) || args.session.hasDurableVoiceoverClip(clipId, assetId),
    onPrepared: (prepared) => args.preparedTakes.set(args.take, prepared),
    attach: (assetId, duration) =>
      commitRecordedClip(
        args.session,
        clipId,
        assetId,
        duration,
        args.sourceStart,
        args.segments,
        args.trim.trimStart,
        args.onRetained
      ),
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
  segments: readonly ReviewTimeSegment[],
  trimOffset: number,
  onRetained?: () => void
): Promise<void> {
  const before = session.getSnapshot().document.advancedContent;
  if (before.audio.voiceover.some((clip) => clip.id === clipId && clip.assetId === assetId)) {
    if (onRetained && (await session.hasDurableVoiceoverClip(clipId, assetId))) onRetained();
    return;
  }
  const clip = {
    ...importedAudioClip(assetId, duration, placement, placement + duration),
    id: clipId,
  };
  const anchored = anchorReviewVoiceoverAtSource(clip, segments, trimOffset);
  const voiceoverSegments = before.audio.voiceoverSegments ?? [...segments];
  try {
    await session.commitDurable({
      id: crypto.randomUUID(),
      at: Date.now(),
      target: 'advancedContent',
      before,
      after: {
        ...before,
        audio: {
          ...before.audio,
          voiceoverSegments,
          voiceover: [
            ...before.audio.voiceover.map((item) => anchorReviewVoiceover(item, voiceoverSegments)),
            anchored,
          ],
        },
      },
    });
  } catch (error) {
    if (await session.hasDurableVoiceoverClip(clipId, assetId)) {
      onRetained?.();
      await session.reload();
    }
    throw error;
  }
  onRetained?.();
}
