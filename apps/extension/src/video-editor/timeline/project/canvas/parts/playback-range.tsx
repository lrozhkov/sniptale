import {
  projectTimelineInterval,
  projectTimelinePoint,
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
    <>
      <div
        aria-hidden="true"
        data-ui="video-editor.timeline.range-fill"
        className={[
          'pointer-events-none absolute inset-y-0 z-10',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_18%,transparent)]',
        ].join(' ')}
        style={{ left: geometry.left, width: geometry.width }}
      />
      {(['start', 'end'] as const).map((edge) => {
        const time = props.playbackRange![edge];
        const left = props.projection
          ? projectTimelinePoint(props.projection, time)
          : time * props.pixelsPerSecond;
        return left === null ? null : (
          <div
            key={edge}
            aria-hidden="true"
            data-ui={`video-editor.timeline.range-edge.${edge}`}
            className={[
              'pointer-events-none absolute inset-y-0 z-10 w-px',
              'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_40%,transparent)]',
            ].join(' ')}
            style={{ left }}
          />
        );
      })}
    </>
  );
}
