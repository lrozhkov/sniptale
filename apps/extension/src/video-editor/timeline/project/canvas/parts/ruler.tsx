import { formatPreciseTime, formatTimelineRulerLabel } from '../../interaction-state/helpers';
import type { VideoEditorPlaybackRange } from '../../../../interaction/playback/range';

export function ProjectTimelineRuler(props: {
  onBeginRangeSelection: (event: React.PointerEvent<HTMLDivElement>) => void;
  playbackRange: VideoEditorPlaybackRange | null;
  pixelsPerSecond: number;
  rulerMarkers: {
    id: string;
    isMajor: boolean;
    label: string | null;
    second: number;
    spanSeconds: number;
  }[];
}) {
  return (
    <div
      className={[
        'sticky top-0 z-20 flex h-[30px] items-end border-b',
        'border-[var(--sniptale-color-border-soft)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,transparent)]',
        'relative px-0',
      ].join(' ')}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={props.onBeginRangeSelection}
    >
      <ProjectTimelineRulerRangeMarkers
        pixelsPerSecond={props.pixelsPerSecond}
        playbackRange={props.playbackRange}
      />
      {props.rulerMarkers.map((marker) => (
        <div
          key={marker.id}
          className={[
            'relative h-full border-l',
            marker.isMajor
              ? 'border-[var(--sniptale-color-border-soft)]'
              : 'border-[var(--sniptale-color-border-subtle)]',
          ].join(' ')}
          style={{ width: marker.spanSeconds * props.pixelsPerSecond }}
        >
          {marker.label ? (
            <span className="absolute left-1 top-1 text-[10px] font-medium text-[var(--sniptale-color-text-dim)]">
              {formatTimelineRulerLabel(marker.second)}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ProjectTimelineRulerRangeMarkers(props: {
  pixelsPerSecond: number;
  playbackRange: VideoEditorPlaybackRange | null;
}) {
  if (!props.playbackRange) {
    return null;
  }

  return (
    <>
      <ProjectTimelineRulerRangeMarker
        align="left"
        label={formatPreciseTime(props.playbackRange.start)}
        left={props.playbackRange.start * props.pixelsPerSecond}
      />
      <ProjectTimelineRulerRangeMarker
        align="right"
        label={formatPreciseTime(props.playbackRange.end)}
        left={props.playbackRange.end * props.pixelsPerSecond}
      />
    </>
  );
}

function ProjectTimelineRulerRangeMarker(props: {
  align: 'left' | 'right';
  label: string;
  left: number;
}) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 z-10"
      style={{ left: props.left }}
    >
      <div className="absolute inset-y-0 left-0 w-px bg-[var(--sniptale-color-accent-emphasis)]" />
      <span
        className={[
          'absolute top-0 rounded-[8px] border px-1.5 py-0.5 text-[9px] font-semibold leading-none',
          'border-[color:color-mix(in_srgb,var(--sniptale-color-border-accent-strong)_45%,transparent)]',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_94%,var(--sniptale-color-accent-soft)_6%)]',
          'text-[var(--sniptale-color-accent-emphasis)]',
          props.align === 'left' ? 'left-1' : 'right-1 -translate-x-full',
        ].join(' ')}
      >
        {props.label}
      </span>
    </div>
  );
}
