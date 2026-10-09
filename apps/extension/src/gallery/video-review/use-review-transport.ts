import type { OriginalAudioAttenuation } from '../../features/video/review/advanced/original-audio';
import type { ReviewEdit } from '../../features/video/review/types';
import type {
  QuickEditAudioClip,
  QuickEditOriginalAudio,
} from '../../features/video/review/advanced/types';
import { useReviewPlayback } from './use-playback';
import { useReviewTimeMap } from './use-review-time';
import { useReviewEditorAudioRuntime } from './use-review-audio-runtime';
import type { LoadedReview } from './use-session';

/** One transport owner: source-time playback, the review time map, and preview audio. */
export function useReviewTransport(args: {
  resource: LoadedReview;
  edits: readonly ReviewEdit[];
  originalAudio: QuickEditOriginalAudio;
  revoice: readonly QuickEditAudioClip[];
  automaticOriginalRanges: readonly OriginalAudioAttenuation[];
  voiceover: readonly QuickEditAudioClip[];
  music: readonly QuickEditAudioClip[];
  onSeek(value: number): void;
  boundaries(): readonly number[] | undefined;
  onTransportFailure(): void;
  onTransportRecovered?(): void;
  onInvalidRange?(): void;
  silent?: boolean;
}) {
  const { session, source } = args.resource;
  const {
    video,
    time,
    onTime,
    playing,
    setPlaying,
    seek,
    play,
    playbackRange,
    setPlaybackRange,
    onEnded,
    onMediaError,
    recovering,
    seekRevision,
  } = useReviewPlayback({
    duration: source.duration,
    edits: args.edits,
    original: args.originalAudio,
    automaticOriginalRanges: args.automaticOriginalRanges,
    silent: args.silent ?? false,
    retainCutTime: args.silent ?? false,
    boundaries: args.boundaries,
    onSeek: args.onSeek,
    onFailure: args.onTransportFailure,
    onRecovered: args.onTransportRecovered,
    onInvalidRange: args.onInvalidRange,
  });
  const timeline = useReviewTimeMap(source, args.edits, time);
  useReviewEditorAudioRuntime({
    video,
    playing: playing && !args.silent,
    silent: args.silent ?? false,
    outputTime: timeline.sceneOutputTime,
    seekRevision,
    originalAudio: args.originalAudio,
    revoice: args.revoice,
    automaticOriginalRanges: args.automaticOriginalRanges,
    voiceover: args.voiceover,
    music: args.music,
    sessionKey: session.getSnapshot().snapshot.workspace.aggregateId,
    onFailure: (stopPlayback) => {
      if (stopPlayback) setPlaying(false);
      args.onTransportFailure();
    },
  });
  return {
    video,
    time,
    onTime,
    playing,
    setPlaying,
    seek,
    play,
    timeline,
    playbackRange,
    setPlaybackRange,
    onEnded,
    onMediaError,
    recovering,
    seekRevision,
  };
}
