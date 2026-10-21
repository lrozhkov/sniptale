import type { VideoProjectAudioClip, VideoProjectVideoClip } from '../project/types/model';
import { isVideoProjectClip } from '../project/validation/clips';
import { MAX_VIDEO_PROJECT_DURATION_SECONDS } from '../project/validation/primitives';
import { planReviewCutTransitions, type ReviewCutTransitionPlan } from './cuts';
import { buildReviewTimeMap } from './timeline';
import type { ReviewTimeSegment } from './time-segment';
import type { ReviewEdit, ReviewSource } from './types';
import { parseReviewOperation, parseReviewSource } from './validation';

type Cut = Extract<ReviewEdit, { kind: 'cut' }>;

/** An exact retained source slice and the ordinary clips that represent it. */
interface ReviewProjectTimelineSlice {
  segment: ReviewTimeSegment;
  videoClipId: string;
  audioClipId?: string;
}

/** Inactive cuts retain their authored intent even without two independently visible sides. */
interface ReviewProjectCutBoundary {
  edit: Cut;
  time: number;
  outgoingClipId?: string;
  incomingClipId?: string;
}

/** Intermediate conversion data, not an admitted or publishable Native project. */
export interface ReviewProjectTimelinePlan {
  source: ReviewSource;
  duration: number;
  sourceInstanceId: string;
  audioSourceInstanceId?: string;
  videoClips: VideoProjectVideoClip[];
  audioClips: VideoProjectAudioClip[];
  slices: ReviewProjectTimelineSlice[];
  cuts: ReviewProjectCutBoundary[];
  /** Gallery cut sampling differs from held whole-composition bookend joins. */
  transitions: ReviewCutTransitionPlan[];
}

export class ReviewProjectTimelineError extends Error {
  constructor(readonly reason: 'invalid-input' | 'empty-result' | 'duration') {
    super(`Review timeline conversion refused: ${reason}.`);
    this.name = 'ReviewProjectTimelineError';
  }
}

/**
 * Materializes the shared review clock into ordinary source clips. The caller supplies
 * neutral full-source templates and a stable operation identity; this function acquires
 * no resources, generates no identities and never publishes a partial project.
 */
export function planReviewProjectTimeline(args: {
  operationId: string;
  source: ReviewSource;
  edits: readonly ReviewEdit[];
  video: VideoProjectVideoClip;
  audio?: VideoProjectAudioClip;
}): ReviewProjectTimelinePlan {
  assertInput(args);
  const segments = buildReviewTimeMap(args.source.duration, args.edits);
  const duration = segments.at(-1)!.resultEnd;
  if (duration <= 0) throw new ReviewProjectTimelineError('empty-result');
  if (duration > MAX_VIDEO_PROJECT_DURATION_SECONDS)
    throw new ReviewProjectTimelineError('duration');
  const sourceInstanceId = `${args.operationId}:source`;
  const audioSourceInstanceId = `${args.operationId}:original-audio`;
  const videoClips: VideoProjectVideoClip[] = [];
  const audioClips: VideoProjectAudioClip[] = [];
  const slices: ReviewProjectTimelineSlice[] = [];
  for (const segment of segments) {
    if (segment.kind === 'cut') continue;
    const index = slices.length;
    const groupId = args.audio ? `${args.operationId}:group:${index}` : null;
    const timing = {
      sourceInstanceId,
      sourceStart: segment.sourceStart,
      sourceDuration: segment.sourceEnd - segment.sourceStart,
      startTime: segment.resultStart,
      duration: segment.resultEnd - segment.resultStart,
      playbackRate: segment.rate,
      groupId,
      linkMode: groupId ? ('LINKED' as const) : ('DETACHED' as const),
    };
    const speed = args.edits.find(
      (edit) =>
        edit.kind === 'speed' && edit.start <= segment.sourceStart && edit.end >= segment.sourceEnd
    );
    const muteSpeed = speed?.kind === 'speed' && speed.audio === 'mute';
    const video: VideoProjectVideoClip = {
      ...structuredClone(args.video),
      ...timing,
      id: `${args.operationId}:video:${index}`,
      muted: Boolean(args.audio) || args.video.muted || muteSpeed,
    };
    const audio = args.audio
      ? {
          ...structuredClone(args.audio),
          ...timing,
          sourceInstanceId: audioSourceInstanceId,
          id: `${args.operationId}:audio:${index}`,
          muted: args.audio.muted || muteSpeed,
        }
      : undefined;
    videoClips.push(video);
    if (audio) audioClips.push(audio);
    slices.push({
      segment: { ...segment },
      videoClipId: video.id,
      ...(audio ? { audioClipId: audio.id } : {}),
    });
  }
  return {
    source: structuredClone(args.source),
    duration,
    sourceInstanceId,
    ...(args.audio ? { audioSourceInstanceId } : {}),
    videoClips,
    audioClips,
    slices,
    cuts: args.edits.flatMap((edit) => {
      if (edit.kind !== 'cut') return [];
      const segment = segments.find((part) => part.sourceStart === edit.start)!;
      const outgoing = slices.find((slice) => slice.segment.sourceEnd === edit.start);
      const incoming = slices.find((slice) => slice.segment.sourceStart === edit.end);
      return [
        {
          edit: structuredClone(edit),
          time: segment.resultStart,
          ...(outgoing ? { outgoingClipId: outgoing.videoClipId } : {}),
          ...(incoming ? { incomingClipId: incoming.videoClipId } : {}),
        },
      ];
    }),
    transitions: planReviewCutTransitions(args.source.duration, args.edits),
  };
}

function assertInput(args: Parameters<typeof planReviewProjectTimeline>[0]): void {
  const neutral = (clip: VideoProjectVideoClip | VideoProjectAudioClip) =>
    isVideoProjectClip(clip) &&
    clip.startTime === 0 &&
    clip.duration === args.source.duration &&
    clip.sourceStart === 0 &&
    clip.sourceDuration === args.source.duration &&
    (clip.playbackRate === undefined || clip.playbackRate === 1) &&
    clip.fadeInMs === 0 &&
    clip.fadeOutMs === 0 &&
    clip.transitionIn === 'NONE' &&
    clip.transitionOut === 'NONE' &&
    clip.audioGainStart === clip.audioGainEnd &&
    clip.volumeEnvelopeStart === clip.volumeEnvelopeEnd;
  if (
    !/^[a-zA-Z0-9_-]{1,128}$/.test(args.operationId) ||
    !parseReviewSource(args.source) ||
    !neutral(args.video) ||
    (args.audio &&
      (!neutral(args.audio) ||
        args.audio.id === args.video.id ||
        args.audio.trackId === args.video.trackId ||
        args.audio.assetId !== args.video.assetId)) ||
    new Set(args.edits.map((edit) => edit.id)).size !== args.edits.length ||
    args.edits.some(
      (edit) =>
        !parseReviewOperation(
          { id: 'conversion', at: 0, target: 'edit', before: null, after: edit },
          args.source.duration
        )
    )
  )
    throw new ReviewProjectTimelineError('invalid-input');
}
