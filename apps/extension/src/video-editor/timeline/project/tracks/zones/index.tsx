import { Trash2 } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { translate } from '../../../../../platform/i18n';
import { TIMELINE_OBJECT_MARKER_PROPS } from '../../canvas/hover-preview';
import type { TimelineCutZone, TimelineGapZone, TimelineJunctionZone, TimelineZone } from './model';
import {
  hasVideoEditorEffectDocumentDragType,
  readVideoEditorEffectDocumentDragPayload,
} from '../../../../contracts/effect-document-drag';
import type { ProjectTimelineProps } from '../../types';
export type { TimelineJunctionZone } from './model';
export {
  buildTrackCutZones,
  buildTrackGapZones,
  buildTrackJunctionZones,
  buildTrackStackedOverlapZones,
} from './model';

const STACKED_OVERLAP_ZONE_CLASS_NAME = [
  'pointer-events-none absolute inset-y-2 z-0 rounded-[12px] border',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-info)_40%,transparent)]',
  'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_16%,transparent)]',
  [
    'bg-[linear-gradient(',
    '90deg,',
    'color-mix(in_srgb,var(--sniptale-color-info)_28%,transparent),',
    'color-mix(in_srgb,var(--sniptale-color-accent-soft)_58%,transparent))]',
  ].join(''),
].join(' ');

export function ProjectTimelineTrackZones(props: {
  cutZones: TimelineCutZone[];
  gapZones: TimelineGapZone[];
  junctionZones?: TimelineJunctionZone[];
  pixelsPerSecond: number;
  selectedTransitionId?: string | null;
  stackedOverlapZones: TimelineZone[];
  onCloseTrackGap: (trackId: string, gapStart: number, gapEnd: number) => void;
  onDropEffectDocument?: ProjectTimelineProps['onDropEffectDocument'];
  onSelectTransition?: (transitionId: string) => void;
}) {
  return (
    <>
      <TrackCutZoneLayer cutZones={props.cutZones} pixelsPerSecond={props.pixelsPerSecond} />
      <TrackGapZoneLayer
        gapZones={props.gapZones}
        onCloseTrackGap={props.onCloseTrackGap}
        pixelsPerSecond={props.pixelsPerSecond}
      />
      <TrackStackedOverlapLayer
        pixelsPerSecond={props.pixelsPerSecond}
        stackedOverlapZones={props.stackedOverlapZones}
      />
      <TrackJunctionZoneLayer
        junctionZones={props.junctionZones ?? []}
        pixelsPerSecond={props.pixelsPerSecond}
        selectedTransitionId={props.selectedTransitionId ?? null}
        onDropEffectDocument={props.onDropEffectDocument}
        onSelectTransition={props.onSelectTransition}
      />
    </>
  );
}

function TrackJunctionZoneLayer(props: {
  junctionZones: TimelineJunctionZone[];
  pixelsPerSecond: number;
  selectedTransitionId: string | null;
  onDropEffectDocument: ProjectTimelineProps['onDropEffectDocument'] | undefined;
  onSelectTransition: ((transitionId: string) => void) | undefined;
}) {
  return props.junctionZones.map((zone) => (
    <TrackJunctionZoneButton
      key={zone.id}
      zone={zone}
      pixelsPerSecond={props.pixelsPerSecond}
      selected={props.selectedTransitionId === zone.id}
      onDropEffectDocument={props.onDropEffectDocument}
      onSelectTransition={props.onSelectTransition}
    />
  ));
}

function TrackJunctionZoneButton(props: {
  onDropEffectDocument: ProjectTimelineProps['onDropEffectDocument'] | undefined;
  onSelectTransition: ((transitionId: string) => void) | undefined;
  pixelsPerSecond: number;
  selected: boolean;
  zone: TimelineJunctionZone;
}) {
  return (
    <button
      {...TIMELINE_OBJECT_MARKER_PROPS}
      type="button"
      aria-label={props.zone.title}
      data-ui="timeline.track-transition-zone"
      title={props.zone.title}
      className={[
        'absolute inset-y-2 z-30 flex min-w-[28px] items-center justify-center overflow-hidden',
        'rounded-[10px] border px-1 text-[10px] font-semibold transition-[border-color,filter]',
        props.selected ? props.zone.zoneSelectedClassName : props.zone.zoneClassName,
      ].join(' ')}
      style={getJunctionZoneStyle(props.zone, props.pixelsPerSecond)}
      onClick={(event) => {
        event.stopPropagation();
        props.onSelectTransition?.(props.zone.id);
      }}
      onPointerDown={stopPointerPropagation}
      onDragOver={(event) => {
        if (!hasVideoEditorEffectDocumentDragType(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(event) => {
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
      <span className="pointer-events-none truncate">{props.zone.label}</span>
    </button>
  );
}

function stopPointerPropagation(event: ReactPointerEvent): void {
  event.stopPropagation();
}

function getJunctionZoneStyle(zone: TimelineJunctionZone, pixelsPerSecond: number) {
  return {
    left: zone.start * pixelsPerSecond,
    width: Math.max(28, (zone.end - zone.start) * pixelsPerSecond),
  };
}

function TrackCutZoneLayer(props: { cutZones: TimelineCutZone[]; pixelsPerSecond: number }) {
  return props.cutZones.map((zone) => (
    <div
      key={zone.id}
      aria-hidden="true"
      className={[
        'pointer-events-none absolute inset-y-3 z-20 w-[6px] -translate-x-1/2 rounded-full',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_80%,transparent)]',
        'shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-border-strong)_40%,transparent)]',
      ].join(' ')}
      style={{ left: zone.time * props.pixelsPerSecond }}
    />
  ));
}

function TrackGapZoneLayer(props: {
  gapZones: TimelineGapZone[];
  onCloseTrackGap: (trackId: string, gapStart: number, gapEnd: number) => void;
  pixelsPerSecond: number;
}) {
  return props.gapZones.map((zone) => {
    const width = Math.max(18, (zone.end - zone.start) * props.pixelsPerSecond);

    return (
      <button
        {...TIMELINE_OBJECT_MARKER_PROPS}
        key={zone.id}
        type="button"
        aria-label={translate('videoEditor.timeline.closeGap')}
        title={translate('videoEditor.timeline.closeGap')}
        onClick={(event) => {
          event.stopPropagation();
          props.onCloseTrackGap(zone.trackId, zone.start, zone.end);
        }}
        onPointerDown={(event) => event.stopPropagation()}
        className={[
          'group absolute inset-y-2 z-10 overflow-hidden rounded-[12px] border border-dashed',
          'border-[color:color-mix(in_srgb,var(--sniptale-color-warning)_28%,transparent)]',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-warning-soft)_0%,transparent)]',
          'transition-[background-color,border-color]',
          'hover:border-[color:color-mix(in_srgb,var(--sniptale-color-warning)_62%,transparent)]',
          'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-warning-soft)_28%,transparent)]',
        ].join(' ')}
        style={{ left: zone.start * props.pixelsPerSecond, width }}
      >
        <span
          className={[
            'pointer-events-none absolute left-1/2 top-1/2 flex h-6 w-6',
            '-translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full',
            'bg-[var(--sniptale-color-surface-panel)] text-[var(--sniptale-color-warning)]',
            'opacity-0 shadow-sm transition-opacity group-hover:opacity-100',
          ].join(' ')}
        >
          <Trash2 size={13} strokeWidth={2.1} />
        </span>
      </button>
    );
  });
}

function TrackStackedOverlapLayer(props: {
  pixelsPerSecond: number;
  stackedOverlapZones: TimelineZone[];
}) {
  return props.stackedOverlapZones.map((zone) => (
    <div
      key={zone.id}
      data-ui="timeline.track-overlap-zone"
      className={STACKED_OVERLAP_ZONE_CLASS_NAME}
      style={{
        left: zone.start * props.pixelsPerSecond,
        width: Math.max(10, (zone.end - zone.start) * props.pixelsPerSecond),
      }}
    />
  ));
}
