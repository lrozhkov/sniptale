import {
  projectTimelineInterval,
  projectTimelinePoint,
  type TimelineProjection,
} from '../../interaction-state/projection';
import { Trash2 } from 'lucide-react';
import type { ReactNode, PointerEvent as ReactPointerEvent } from 'react';
import { translate } from '../../../../../platform/i18n';
import { TIMELINE_OBJECT_MARKER_PROPS } from '../../canvas/hover-preview';
import type { TimelineCutZone, TimelineGapZone, TimelineJunctionZone } from './model';
import {
  hasVideoEditorEffectDocumentDragType,
  readVideoEditorEffectDocumentDragPayload,
} from '../../../../contracts/effect-document-drag';
import type { ProjectTimelineProps } from '../../types';
export type { TimelineJunctionZone } from './model';
export { buildTrackCutZones, buildTrackGapZones, buildTrackJunctionZones } from './model';

type TransitionTrimHandler = (
  event: ReactPointerEvent,
  transitionId: string,
  edge: 'start' | 'end'
) => void;

export function ProjectTimelineTrackZones(props: {
  onBeginTransitionTrim?: TransitionTrimHandler | undefined;
  cutZones: TimelineCutZone[];
  gapZones: TimelineGapZone[];
  renderGapAction?: ((zone: TimelineGapZone) => ReactNode) | undefined;
  junctionZones?: TimelineJunctionZone[];
  pixelsPerSecond: number;
  projection?: TimelineProjection | undefined;
  selectedTransitionId?: string | null;
  onCloseTrackGap: (trackId: string, gapStart: number, gapEnd: number) => void;
  onDropEffectDocument?: ProjectTimelineProps['onDropEffectDocument'];
  onSelectTransition?: (transitionId: string) => void;
}) {
  return (
    <>
      <TrackCutZoneLayer
        cutZones={props.cutZones}
        pixelsPerSecond={props.pixelsPerSecond}
        projection={props.projection}
      />
      <TrackGapZoneLayer
        gapZones={props.gapZones}
        renderGapAction={props.renderGapAction}
        onCloseTrackGap={props.onCloseTrackGap}
        pixelsPerSecond={props.pixelsPerSecond}
        projection={props.projection}
      />
      <TrackJunctionZoneLayer
        junctionZones={props.junctionZones ?? []}
        pixelsPerSecond={props.pixelsPerSecond}
        projection={props.projection}
        selectedTransitionId={props.selectedTransitionId ?? null}
        onDropEffectDocument={props.onDropEffectDocument}
        onSelectTransition={props.onSelectTransition}
        onBeginTransitionTrim={props.onBeginTransitionTrim}
      />
    </>
  );
}

function TrackJunctionZoneLayer(props: {
  onBeginTransitionTrim: TransitionTrimHandler | undefined;
  junctionZones: TimelineJunctionZone[];
  pixelsPerSecond: number;
  projection?: TimelineProjection | undefined;
  selectedTransitionId: string | null;
  onDropEffectDocument: ProjectTimelineProps['onDropEffectDocument'] | undefined;
  onSelectTransition: ((transitionId: string) => void) | undefined;
}) {
  return props.junctionZones.map((zone) => (
    <TrackJunctionZoneButton
      key={zone.id}
      zone={zone}
      pixelsPerSecond={props.pixelsPerSecond}
      projection={props.projection}
      selected={props.selectedTransitionId === zone.id}
      onDropEffectDocument={props.onDropEffectDocument}
      onSelectTransition={props.onSelectTransition}
      onBeginTransitionTrim={props.onBeginTransitionTrim}
    />
  ));
}

function TrackJunctionZoneButton(props: {
  onBeginTransitionTrim: TransitionTrimHandler | undefined;
  onDropEffectDocument: ProjectTimelineProps['onDropEffectDocument'] | undefined;
  onSelectTransition: ((transitionId: string) => void) | undefined;
  pixelsPerSecond: number;
  projection?: TimelineProjection | undefined;
  selected: boolean;
  zone: TimelineJunctionZone;
}) {
  const geometry = props.projection
    ? projectTimelineInterval(props.projection, props.zone.start, props.zone.end)
    : {
        ...getJunctionZoneStyle(props.zone, props.pixelsPerSecond),
        offsetSeconds: 0,
        durationSeconds: props.zone.end - props.zone.start,
        includesStart: true,
        includesEnd: true,
      };
  if (!geometry) return null;
  const duration = props.zone.end - props.zone.start;
  const from = (geometry.offsetSeconds / duration) * 20;
  const to = ((geometry.offsetSeconds + geometry.durationSeconds) / duration) * 20;
  return (
    <div
      {...TIMELINE_OBJECT_MARKER_PROPS}
      data-ui="timeline.track-transition-zone"
      title={props.zone.title}
      className={[
        'video-editor-timeline-item',
        'group absolute bottom-2 z-30 flex h-5 items-center justify-center overflow-hidden',
        'rounded-sm outline outline-1 -outline-offset-1 px-0 text-[10px] font-semibold',
        'bg-[var(--sniptale-color-surface-overlay)] text-[var(--sniptale-color-text-secondary)]',
        props.selected
          ? 'video-editor-timeline-item-selected outline-[var(--sniptale-color-border-strong)]'
          : 'outline-[var(--sniptale-color-border-strong)]',
      ].join(' ')}
      style={{ left: geometry.left, width: geometry.width }}
      onClick={(event) => {
        event.stopPropagation();
        props.onSelectTransition?.(props.zone.id);
      }}
      onPointerDown={stopPointerPropagation}
      onDragOver={(event) => {
        if (props.zone.audio || !hasVideoEditorEffectDocumentDragType(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(event) => {
        if (props.zone.audio) return;
        const payload = readVideoEditorEffectDocumentDragPayload(event.dataTransfer);
        if (!payload || payload.kind !== 'transition') return;
        event.preventDefault();
        event.stopPropagation();
        props.onDropEffectDocument?.(
          payload,
          { kind: 'transition', transitionId: props.zone.id },
          props.zone.start
        );
        props.onSelectTransition?.(props.zone.id);
      }}
    >
      <button
        type="button"
        aria-label={props.zone.title}
        className="absolute inset-0 w-full h-full !cursor-pointer"
      />
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-60"
        viewBox="0 0 100 20"
        preserveAspectRatio="none"
      >
        <path
          d={`M0 ${from} L100 ${to} M0 ${20 - from} L100 ${20 - to}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {geometry.width >= 64 ? (
        <span className="pointer-events-none relative truncate px-1 bg-[var(--sniptale-color-surface-overlay)]">
          {props.zone.label}
        </span>
      ) : null}
      {props.onBeginTransitionTrim
        ? (['start', 'end'] as const)
            .filter((edge) => (edge === 'start' ? geometry.includesStart : geometry.includesEnd))
            .map((edge) => (
              <button
                key={edge}
                {...TIMELINE_OBJECT_MARKER_PROPS}
                type="button"
                tabIndex={-1}
                aria-label={[
                  props.zone.title,
                  translate(
                    edge === 'start'
                      ? 'videoEditor.app.sourceInLabel'
                      : 'videoEditor.app.sourceOutLabel'
                  ),
                ].join(' ')}
                data-transition-trim={edge}
                className={[
                  'absolute inset-y-0 z-10 w-[min(8px,25%)] !cursor-ew-resize',
                  'bg-[var(--sniptale-color-border-strong)] opacity-40 hover:opacity-100',
                  edge === 'start' ? 'left-0' : 'right-0',
                ].join(' ')}
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  props.onBeginTransitionTrim?.(event, props.zone.id, edge);
                }}
              />
            ))
        : null}
    </div>
  );
}

function stopPointerPropagation(event: ReactPointerEvent): void {
  event.stopPropagation();
}

function getJunctionZoneStyle(zone: TimelineJunctionZone, pixelsPerSecond: number) {
  return {
    left: zone.start * pixelsPerSecond,
    width: (zone.end - zone.start) * pixelsPerSecond,
  };
}

function TrackCutZoneLayer(props: {
  cutZones: TimelineCutZone[];
  pixelsPerSecond: number;
  projection?: TimelineProjection | undefined;
}) {
  return props.cutZones.map((zone) => {
    const left = props.projection
      ? projectTimelinePoint(props.projection, zone.time)
      : zone.time * props.pixelsPerSecond;
    if (left === null) return null;
    return (
      <div
        key={zone.id}
        aria-hidden="true"
        className={[
          'pointer-events-none absolute inset-y-3 z-20 w-[6px] -translate-x-1/2 rounded-full',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_80%,transparent)]',
          'shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-border-strong)_40%,transparent)]',
        ].join(' ')}
        style={{ left }}
      />
    );
  });
}

function TrackGapZoneLayer(props: {
  gapZones: TimelineGapZone[];
  renderGapAction?: ((zone: TimelineGapZone) => ReactNode) | undefined;
  onCloseTrackGap: (trackId: string, gapStart: number, gapEnd: number) => void;
  pixelsPerSecond: number;
  projection?: TimelineProjection | undefined;
}) {
  return props.gapZones.map((zone) => {
    const geometry = props.projection
      ? projectTimelineInterval(props.projection, zone.start, zone.end)
      : {
          left: zone.start * props.pixelsPerSecond,
          width: (zone.end - zone.start) * props.pixelsPerSecond,
        };
    if (!geometry) return null;

    return (
      <div
        {...TIMELINE_OBJECT_MARKER_PROPS}
        key={zone.id}
        onPointerDown={stopPointerPropagation}
        className={[
          'group absolute inset-y-2 z-0 hover:z-30 focus-within:z-30 rounded-sm',
          'outline outline-1 -outline-offset-1 outline-dashed',
          'outline-[color:color-mix(in_srgb,var(--sniptale-color-text-muted)_28%,transparent)]',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_0%,transparent)]',
          'transition-[background-color,outline-color]',
          'hover:outline-[color:color-mix(in_srgb,var(--sniptale-color-text-muted)_62%,transparent)]',
          'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_28%,transparent)]',
        ].join(' ')}
        style={{
          left: geometry.left,
          width: geometry.width,
          backgroundImage: [
            'repeating-linear-gradient(135deg, transparent, transparent 5px,',
            'color-mix(in srgb, var(--sniptale-color-text-muted) 8%, transparent) 5px,',
            'color-mix(in srgb, var(--sniptale-color-text-muted) 8%, transparent) 6px)',
          ].join(' '),
        }}
      >
        <div
          data-ui="video-editor.timeline.gap-actions"
          className={[
            'absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1',
            'rounded-lg border border-[var(--sniptale-color-border-soft)] p-0.5 shadow-sm',
            'bg-[var(--sniptale-color-surface-panel)] opacity-0 group-hover:opacity-100 focus-within:opacity-100',
          ].join(' ')}
        >
          <button
            type="button"
            aria-label={translate('videoEditor.timeline.closeGap')}
            title={translate('videoEditor.timeline.closeGap')}
            className={[
              'flex h-7 w-7 items-center justify-center rounded-md',
              'hover:bg-[var(--sniptale-color-surface-hover)]',
            ].join(' ')}
            onClick={(event) => {
              event.stopPropagation();
              props.onCloseTrackGap(zone.trackId, zone.start, zone.end);
            }}
          >
            <Trash2 size={15} strokeWidth={2.1} />
          </button>
          {props.renderGapAction?.(zone)}
        </div>
      </div>
    );
  });
}
