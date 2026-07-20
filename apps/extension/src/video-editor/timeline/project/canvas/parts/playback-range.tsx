import type { VideoEditorPlaybackRange } from '../../../../interaction/playback/range';

export function ProjectTimelinePlaybackRangeOverlay(props: {
  pixelsPerSecond: number;
  playbackRange: VideoEditorPlaybackRange | null;
}) {
  if (!props.playbackRange) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className={[
        'pointer-events-none absolute inset-y-0 z-10 border',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_40%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_18%,transparent)]',
      ].join(' ')}
      style={{
        left: props.playbackRange.start * props.pixelsPerSecond,
        width: Math.max(
          2,
          (props.playbackRange.end - props.playbackRange.start) * props.pixelsPerSecond
        ),
      }}
    />
  );
}
