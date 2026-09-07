import {
  projectTimelineInterval,
  type TimelineProjection,
} from '../../interaction-state/projection';
import type { VideoEditorPlaybackRange } from '../../../../interaction/playback/range';

export function ProjectTimelinePlaybackRangeOverlay(props: {
  pixelsPerSecond: number;
  projection?: TimelineProjection | undefined;
  playbackRange: VideoEditorPlaybackRange | null;
}) {
  if (!props.playbackRange) {
    return null;
  }

  const geometry = props.projection
    ? projectTimelineInterval(props.projection, props.playbackRange.start, props.playbackRange.end)
    : {
        left: props.playbackRange.start * props.pixelsPerSecond,
        width: (props.playbackRange.end - props.playbackRange.start) * props.pixelsPerSecond,
      };
  if (!geometry) return null;
  return (
    <div
      aria-hidden="true"
      className={[
        'pointer-events-none absolute inset-y-0 z-10 border',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_40%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_18%,transparent)]',
      ].join(' ')}
      style={{
        left: geometry.left,
        width: Math.max(2, geometry.width),
      }}
    />
  );
}
