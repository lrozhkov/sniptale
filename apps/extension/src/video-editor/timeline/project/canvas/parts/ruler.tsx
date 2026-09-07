import {
  projectTimelinePoint,
  timelineTimeToViewportX,
  type TimelineProjection,
} from '../../interaction-state/projection';
import { formatPreciseTime } from '../../interaction-state/helpers';
import type { VideoEditorPlaybackRange } from '../../../../interaction/playback/range';

export function ProjectTimelineRuler(props: {
  children?: React.ReactNode;
  onBeginRangeSelection: (event: React.PointerEvent<HTMLDivElement>) => void;
  playbackRange: VideoEditorPlaybackRange | null;
  pixelsPerSecond: number;
  projection?: TimelineProjection | undefined;
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
      data-ui="video-editor.timeline.ruler"
      className={[
        'sticky top-0 z-40 flex h-[30px] items-end overflow-hidden border-b',
        'border-[var(--sniptale-color-border-soft)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,transparent)]',
        'relative px-0',
      ].join(' ')}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={props.onBeginRangeSelection}
    >
      <ProjectTimelineRulerRangeMarkers
        pixelsPerSecond={props.pixelsPerSecond}
        projection={props.projection}
        playbackRange={props.playbackRange}
      />
      {props.children}
      {props.rulerMarkers.map((marker) => (
        <div
          key={marker.id}
          className={[
            'absolute top-0 h-full border-l',
            marker.isMajor
              ? 'border-[var(--sniptale-color-border-soft)]'
              : 'border-[var(--sniptale-color-border-subtle)]',
          ].join(' ')}
          style={{
            left: props.projection
              ? timelineTimeToViewportX(props.projection, marker.second)
              : marker.second * props.pixelsPerSecond,
            width: marker.spanSeconds * props.pixelsPerSecond,
          }}
        >
          {marker.label ? (
            <span className="absolute left-1 top-1 text-[10px] font-medium text-[var(--sniptale-color-text-dim)]">
              {marker.label}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ProjectTimelineRulerRangeMarkers(props: {
  pixelsPerSecond: number;
  projection?: TimelineProjection | undefined;
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
        left={
          props.projection
            ? projectTimelinePoint(props.projection, props.playbackRange.start)
            : props.playbackRange.start * props.pixelsPerSecond
        }
      />
      <ProjectTimelineRulerRangeMarker
        align="right"
        label={formatPreciseTime(props.playbackRange.end)}
        left={
          props.projection
            ? projectTimelinePoint(props.projection, props.playbackRange.end)
            : props.playbackRange.end * props.pixelsPerSecond
        }
      />
    </>
  );
}

function ProjectTimelineRulerRangeMarker(props: {
  align: 'left' | 'right';
  label: string;
  left: number | null;
}) {
  if (props.left === null) return null;
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
