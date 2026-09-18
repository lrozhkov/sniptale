import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { translate } from '../../platform/i18n';
import type { ReviewEdit } from '../../features/video/review/types';
import type { QuickEditZoomRegion } from '../../features/video/review/advanced/types';
import {
  moveQuickEditZoomRegion,
  trimQuickEditZoomRegion,
} from '../../features/video/review/advanced/zoom';
import {
  SNAP_THRESHOLD_PX,
  getSnapCandidates,
  snapTimelineTime,
} from '../../features/video/review/snap';
import { ReviewButton, reviewTimeLabel } from './controls';

type ZoomTrackProps = {
  duration: number;
  /** Result-time playhead; absent while the source point was removed by a cut. */
  time: number | null;
  regions: readonly QuickEditZoomRegion[];
  edits: readonly ReviewEdit[];
  boundaries: readonly number[] | undefined;
  /** Source-to-result projection; removed source points return null. */
  toOutputTime(source: number): number | null;
  selectedId: string | null;
  onSelect(id: string | null): void;
  onAdd(): void;
  onDragCommit(
    id: string,
    range: { start: number; end: number },
    edge: 'start' | 'end' | 'move'
  ): void;
};
const percent = (time: number, duration: number) => `${(time / duration) * 100}%`;

interface ZoomDragState {
  id: string;
  x: number;
  width: number;
  edge: 'start' | 'end' | 'move';
  range: { start: number; end: number };
  length: number;
  moved: boolean;
  node: HTMLDivElement;
  pointerId: number;
}

/**
 * Drag math for one zoom region: a move picks one snap delta for both edges and
 * keeps the region length, a trim snaps only the dragged edge, and the bounded
 * trim/move helpers enforce the neighbor window.
 */
function zoomDragRange(args: {
  edge: ZoomDragState['edge'];
  delta: number;
  length: number;
  region: QuickEditZoomRegion;
  duration: number;
  widthPx: number;
  bypass: boolean;
  /** Result-time candidates: projected edit/boundary edges plus the playhead. */
  snapEdges: readonly number[];
  regions: readonly QuickEditZoomRegion[];
}): { start: number; end: number; guide: number | null } {
  const { region, duration } = args;
  const threshold = args.bypass ? 0 : (SNAP_THRESHOLD_PX * duration) / args.widthPx;
  const candidates = args.bypass
    ? []
    : getSnapCandidates({
        edits: [],
        playhead: null,
        zoomRegions: args.regions.filter((region) => !region.dormant),
        boundaries: args.snapEdges,
      }).filter((value) => value !== region.start && value !== region.end);
  if (args.edge === 'move') {
    const freeStart = Math.max(0, Math.min(duration - args.length, region.start + args.delta));
    const snappedStart = snapTimelineTime(freeStart, candidates, threshold);
    const snappedEnd = snapTimelineTime(freeStart + args.length, candidates, threshold);
    const startDistance =
      snappedStart.candidate === null ? Infinity : Math.abs(snappedStart.time - freeStart);
    const endDistance =
      snappedEnd.candidate === null
        ? Infinity
        : Math.abs(snappedEnd.time - (freeStart + args.length));
    const guidedStart =
      startDistance <= endDistance ? snappedStart.time : snappedEnd.time - args.length;
    const moved = moveQuickEditZoomRegion({
      regions: args.regions,
      id: region.id,
      requestedStart: guidedStart,
      timelineDuration: duration,
    });
    return {
      start: moved.start,
      end: moved.end,
      guide: startDistance <= endDistance ? snappedStart.candidate : snappedEnd.candidate,
    };
  }
  if (args.edge === 'start') {
    const requested = region.start + args.delta;
    const snap = snapTimelineTime(requested, candidates, threshold);
    const range = trimQuickEditZoomRegion({
      regions: args.regions,
      id: region.id,
      edge: 'start',
      time: snap.time,
      timelineDuration: duration,
    });
    return { ...range, guide: snap.candidate };
  }
  const requestedEnd = region.end + args.delta;
  const snapEnd = snapTimelineTime(requestedEnd, candidates, threshold);
  const rangeEnd = trimQuickEditZoomRegion({
    regions: args.regions,
    id: region.id,
    edge: 'end',
    time: snapEnd.time,
    timelineDuration: duration,
  });
  return { ...rangeEnd, guide: snapEnd.candidate };
}

/** Zoom regions on their own lane; drags snap to shared candidates and never overlap. */
export function ReviewZoomTrack(props: ZoomTrackProps) {
  const [guide, setGuide] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ id: string; start: number; end: number } | null>(null);
  const drag = useRef<ZoomDragState | null>(null);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      const current = drag.current;
      if (event.key !== 'Escape' || !current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      drag.current = null;
      setPreview(null);
      setGuide(null);
      if (current.node.hasPointerCapture(current.pointerId))
        current.node.releasePointerCapture(current.pointerId);
    };
    window.addEventListener('keydown', cancel, true);
    return () => window.removeEventListener('keydown', cancel, true);
  }, []);
  const shownRange = (region: QuickEditZoomRegion) =>
    preview?.id === region.id ? preview : { start: region.start, end: region.end };
  const { edits, boundaries, time, toOutputTime } = props;
  // One result-time candidate set: source edit/boundary edges projected, removed points dropped.
  const snapEdges = useMemo(() => {
    const values = new Set<number>();
    for (const value of edits.flatMap((edit) => [edit.start, edit.end])) {
      const projected = toOutputTime(value);
      if (projected !== null) values.add(projected);
    }
    for (const value of boundaries ?? []) {
      const projected = toOutputTime(value);
      if (projected !== null) values.add(projected);
    }
    if (time !== null) values.add(time);
    return [...values].sort((a, b) => a - b);
  }, [edits, boundaries, time, toOutputTime]);
  return (
    <div
      data-ui="gallery.videoReview.zoomLane"
      className="relative mt-1 h-8 rounded bg-[var(--sniptale-color-surface-hover)]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center gap-2 px-3
            text-[11px] text-[var(--sniptale-color-text-muted)]"
      >
        {translate('gallery.videoReview.zoomTrack')}
      </div>
      {props.regions.map((region) => (
        <ReviewZoomRegionBlock
          key={region.id}
          {...props}
          snapEdges={snapEdges}
          region={region}
          range={shownRange(region)}
          selected={props.selectedId === region.id}
          drag={drag}
          onPreview={(value) => setPreview(value && { id: region.id, ...value })}
          onGuide={setGuide}
        />
      ))}
      {props.time !== null ? (
        <div
          aria-hidden="true"
          data-zoom-playhead="true"
          className="pointer-events-none absolute inset-y-0 z-10 w-px
              bg-[var(--sniptale-color-accent)]"
          style={{ left: percent(props.time, props.duration) }}
        />
      ) : null}
      {guide !== null ? (
        <div
          aria-hidden="true"
          data-zoom-guide="true"
          className="pointer-events-none absolute inset-y-0 z-20 w-px
              bg-[var(--sniptale-color-accent-emphasis)]"
          style={{ left: percent(guide, props.duration) }}
        />
      ) : null}
      {!props.regions.length ? (
        <p
          className="pointer-events-none absolute inset-0 flex items-center justify-center
              text-[11px] text-[var(--sniptale-color-text-muted)]"
        >
          {translate('gallery.videoReview.zoomEmptyHint')}
        </p>
      ) : null}
      <ReviewButton
        label={translate('gallery.videoReview.zoomAdd')}
        className="!absolute right-1 top-1/2 z-10 !h-6 !min-h-6 -translate-y-1/2 !px-1.5"
        onClick={props.onAdd}
      >
        <Plus size={14} />
      </ReviewButton>
    </div>
  );
}

function ReviewZoomRegionBlock(
  props: ZoomTrackProps & {
    region: QuickEditZoomRegion;
    range: { start: number; end: number };
    selected: boolean;
    drag: React.RefObject<ZoomDragState | null>;
    snapEdges: readonly number[];
    onPreview(range: { start: number; end: number } | null): void;
    onGuide(guide: number | null): void;
  }
) {
  const { region, duration, snapEdges, onPreview, onGuide } = props;
  const label =
    `${translate('gallery.videoReview.zoomRegionLabel')} ` +
    `${reviewTimeLabel(region.start)} – ${reviewTimeLabel(region.end)}`;
  const accentMix = 'color-mix(in_srgb,var(--sniptale-color-accent)';
  const tone = props.selected
    ? `border-[var(--sniptale-color-accent)] bg-[color:${accentMix}_20%,var(--sniptale-color-surface-canvas))]`
    : `border-transparent bg-[color:${accentMix}_10%,var(--sniptale-color-surface-canvas))]`;
  const begin = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    props.onSelect(region.id);
    const target = event.target;
    const edge =
      target instanceof Element
        ? target.closest('[data-zoom-edge]')?.getAttribute('data-zoom-edge')
        : null;
    props.drag.current = {
      id: region.id,
      x: event.clientX,
      width: event.currentTarget.parentElement!.getBoundingClientRect().width,
      edge: edge === 'start' || edge === 'end' ? edge : 'move',
      range: { start: region.start, end: region.end },
      length: region.end - region.start,
      moved: false,
      node: event.currentTarget,
      pointerId: event.pointerId,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      className={`absolute inset-y-0 z-[5] cursor-grab rounded border text-xs
          active:cursor-grabbing ${tone}`}
      style={{
        left: percent(props.range.start, duration),
        width: percent(props.range.end - props.range.start, duration),
      }}
      onPointerDown={begin}
      onPointerMove={(event) => {
        const current = props.drag.current;
        if (!current || current.width <= 0) return;
        current.moved ||= Math.abs(event.clientX - current.x) > 3;
        const next = zoomDragRange({
          edge: current.edge,
          delta: ((event.clientX - current.x) / current.width) * duration,
          length: current.length,
          region,
          duration,
          widthPx: current.width,
          bypass: event.shiftKey,
          snapEdges,
          regions: props.regions,
        });
        onGuide(next.guide);
        if (next.start < next.end) {
          current.range = { start: next.start, end: next.end };
          onPreview({ start: next.start, end: next.end });
        }
      }}
      onPointerUp={(event) => {
        const current = props.drag.current;
        props.drag.current = null;
        onPreview(null);
        onGuide(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        if (current?.moved) props.onDragCommit(current.id, current.range, current.edge);
      }}
      onPointerCancel={() => {
        props.drag.current = null;
        onPreview(null);
        onGuide(null);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        props.onSelect(region.id);
      }}
    >
      <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] text-[var(--sniptale-color-text-muted)]">
        {props.selected ? `${region.transform.scale}×` : ''}
      </span>
      {(['start', 'end'] as const).map((edge) => (
        <span
          key={edge}
          data-zoom-edge={edge}
          className={`absolute inset-y-0 w-2 cursor-ew-resize bg-black/10
              ${edge === 'start' ? 'left-0' : 'right-0'}`}
        />
      ))}
    </div>
  );
}
