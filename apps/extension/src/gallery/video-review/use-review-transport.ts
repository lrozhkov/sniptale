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
  voiceover: readonly QuickEditAudioClip[];
  music: readonly QuickEditAudioClip[];
  onSeek(value: number): void;
  boundaries(): readonly number[] | undefined;
  onTransportFailure(): void;
}) {
  const { session, source } = args.resource;
  const { video, time, onTime, playing, setPlaying, seek, play } = useReviewPlayback({
    duration: source.duration,
    edits: args.edits,
    original: args.originalAudio,
    boundaries: args.boundaries,
    onSeek: args.onSeek,
    onFailure: args.onTransportFailure,
  });
  const timeline = useReviewTimeMap(source, args.edits, time);
  useReviewEditorAudioRuntime({
    video,
    playing,
    outputTime: timeline.sceneOutputTime,
    originalAudio: args.originalAudio,
    voiceover: args.voiceover,
    music: args.music,
    sessionKey: session.getSnapshot().snapshot.workspace.aggregateId,
    onFailure: args.onTransportFailure,
  });
  return { video, time, onTime, playing, setPlaying, seek, play, timeline };
}
