import { ReviewTrackVisibilityButton } from './track-row';
import { reviewTrackMetrics, ReviewTrackRow, ReviewTrackCuts } from './track-row';
import { useReviewResizeBoundary } from './timeline-resize-guide';
import {
  packQuickEditFocusRows,
  quickEditFocusType,
  resolveQuickEditFocusLink,
} from '../../features/video/review/advanced/focus-layout';
import { deferReviewGesture, type ReviewBeforeAction } from './note-transitions';
import { ReviewTimelineLabel } from './timeline-label';
import { reviewTimelineItemTone, reviewTimelineResizeHandleClassName } from './controls';
import { ScanEye, RectangleHorizontal } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { MoveRight, Focus, Eye, EyeOff } from 'lucide-react';
import { translate, formatNumber, useAppLocale } from '../../platform/i18n';
import type { ReviewAnchor, ReviewEdit } from '../../features/video/review/types';
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
import { reviewTrackStatusButtonClassName, reviewTimeLabel } from './controls';
import type { ReviewTrackProjection } from './track-projection';
import { useReviewDragEscape } from './timeline-drag';

type FocusRange = Pick<QuickEditZoomRegion, 'start' | 'end' | 'sourceAnchor'>;
type FocusAxis = Pick<ReviewTrackProjection, 'duration' | 'source' | 'output'>;

/** Focus feedback uses source seconds, including legacy ranges without a source anchor. */
function focusSourceSpan(
  range: FocusRange | undefined,
  projection: ReviewTrackProjection | undefined
) {
  if (!range) return undefined;
  return (
    range.sourceAnchor ?? {
      start: projection?.source(range.start) ?? range.start,
      end: projection?.source(range.end, 'end') ?? range.end,
    }
  );
}

type ZoomTrackProps = {
  compact?: boolean | undefined;
  beforeAction?: ReviewBeforeAction | undefined;
  sourceSelection?: ReviewAnchor | undefined;
  projection?: ReviewTrackProjection | undefined;
  enabled?: boolean;
  onToggleEnabled?(): void;
  duration: number;
  /** Result-time playhead; absent while the source point was removed by a cut. */
  time: number | null;
  regions: readonly QuickEditZoomRegion[];
  edits: readonly ReviewEdit[];
  snapTimes?: readonly number[] | undefined;
  /** Source-to-result projection; removed source points return null. */
  toOutputTime(source: number): number | null;
  selectedId: string | null;
  onSelect(id: string | null): void;
  onLink?(id: string, targetId: string | null): void;
  /** Transient connection-settings selection; a linked gap opens it instead of unlinking. */
  linkSelectedId?: string | null;
  onSelectLink?(id: string): void;
  onDragCommit(
    id: string,
    range: { start: number; end: number },
    edge: 'start' | 'end' | 'move',
    sourceAnchor?: QuickEditZoomRegion['sourceAnchor']
  ): void;
};

interface ZoomDragState {
  admission: ReturnType<typeof deferReviewGesture>;
  id: string;
  x: number;
  sourceAtPointer: number;
  width: number;
  edge: 'start' | 'end' | 'move';
  range: FocusRange;
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
  projection?: FocusAxis | undefined;
}): { start: number; end: number; guide: number | null } {
  const { region, duration } = args;
  const threshold = args.bypass ? 0 : (SNAP_THRESHOLD_PX * duration) / args.widthPx;
  const candidates = args.bypass
    ? []
    : getSnapCandidates({
        edits: [],
        playhead: null,
        zoomRegions: args.regions.filter((item) => item.id !== region.id && !item.dormant),
        boundaries: args.snapEdges,
      });
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
      time: Math.min(snap.time, region.end - zoomTrimMinimum(args, 'start')),
      timelineDuration: duration,
    });
    return { ...range, guide: snap.candidate === range.start ? snap.candidate : null };
  }
  const requestedEnd = region.end + args.delta;
  const snapEnd = snapTimelineTime(requestedEnd, candidates, threshold);
  const rangeEnd = trimQuickEditZoomRegion({
    regions: args.regions,
    id: region.id,
    edge: 'end',
    time: Math.max(snapEnd.time, region.start + zoomTrimMinimum(args, 'end')),
    timelineDuration: duration,
  });
  return { ...rangeEnd, guide: snapEnd.candidate === rangeEnd.end ? snapEnd.candidate : null };
}

/** Keep both grips usable without extending an already shorter authored region. */
function zoomTrimMinimum(
  args: {
    region: QuickEditZoomRegion;
    duration: number;
    widthPx: number;
    projection?: FocusAxis | undefined;
  },
  edge: 'start' | 'end'
): number {
  const { region, projection } = args;
  const sourceDuration = projection?.duration ?? args.duration;
  const widthTime = (24 * sourceDuration) / args.widthPx;
  const fixed =
    edge === 'start'
      ? (projection?.source(region.end, 'end') ?? region.end)
      : (projection?.source(region.start) ?? region.start);
  const sourceLimit = Math.max(
    0,
    Math.min(sourceDuration, fixed + (edge === 'start' ? -widthTime : widthTime))
  );
  const limit = projection?.output(sourceLimit) ?? sourceLimit;
  const minimum = edge === 'start' ? region.end - limit : limit - region.start;
  return Math.max(0.001, Math.min(region.end - region.start, minimum));
}

/** Camera stays on row zero; overlapping overlays pack from their current source ranges. */
export function ReviewZoomTrack(props: ZoomTrackProps) {
  const sourceDuration = props.projection?.duration ?? props.duration;
  const [guide, setGuide] = useState<number | null>(null);
  const [preview, setPreview] = useState<(FocusRange & { id: string }) | null>(null);
  const drag = useRef<ZoomDragState | null>(null);
  useReviewDragEscape(drag, () => {
    setPreview(null);
    setGuide(null);
  });
  const boundary = drag.current;
  const originalRegion = props.regions.find((region) => region.id === boundary?.id);
  const originalSpan = focusSourceSpan(originalRegion, props.projection);
  const resizedSpan = focusSourceSpan(boundary?.range, props.projection);
  useReviewResizeBoundary(
    boundary,
    boundary &&
      boundary.edge !== 'move' &&
      props.regions.some((region) => region.id === boundary.id)
      ? (boundary.range.sourceAnchor?.[boundary.edge] ??
          props.projection?.source(boundary.range[boundary.edge], boundary.edge) ??
          boundary.range[boundary.edge])
      : null,
    originalSpan,
    resizedSpan
  );
  const shownRange = (region: QuickEditZoomRegion) =>
    preview?.id === region.id ? preview : region;
  const shownRegions = props.regions.map((region) => ({ ...region, ...shownRange(region) }));
  const rows = packQuickEditFocusRows(shownRegions);
  const rowCount = Math.max(1, ...Array.from(rows.values(), (row) => row + 1));
  const { edits, time, toOutputTime, duration } = props;
  // Visible result-time endpoints, projected edit edges and playhead; codec frames are not focus targets.
  const snapEdges = useMemo(() => {
    const values = new Set<number>([0, duration]);
    for (const value of [
      ...edits.flatMap((edit) => [edit.start, edit.end]),
      ...(props.snapTimes ?? []),
    ]) {
      const projected = toOutputTime(value);
      if (projected !== null) values.add(projected);
    }
    if (time !== null) values.add(time);
    return [...values].sort((a, b) => a - b);
  }, [edits, time, toOutputTime, duration, props.snapTimes]);
  return (
    <ReviewTrackRow
      track="zoom"
      muted={props.enabled === false}
      label={translate('gallery.videoReview.zoomTrack')}
      icon={<Focus size={14} aria-hidden="true" />}
      controls={
        <>
          {props.onToggleEnabled ? (
            <ReviewTrackVisibilityButton
              track={'zoom'}
              label={translate('gallery.videoReview.zoomEnabled')}
              aria-pressed={props.enabled !== false}
              onClick={props.onToggleEnabled}
              className={`${reviewTrackStatusButtonClassName} !h-7 !min-h-7 !w-7 !px-1`}
            >
              {props.enabled === false ? <EyeOff size={14} /> : <Eye size={14} />}
            </ReviewTrackVisibilityButton>
          ) : null}
        </>
      }
    >
      <div
        data-ui="gallery.videoReview.zoomLane"
        className="relative rounded bg-[var(--sniptale-color-surface-hover)]"
        style={{ height: rowCount * reviewTrackMetrics(props.compact).step }}
      >
        {shownRegions
          .filter((region) => !region.dormant)
          .map((region) => (
            <ReviewZoomGapLink
              key={`link:${region.id}`}
              duration={props.duration}
              enabled={props.enabled}
              linkSelectedId={props.linkSelectedId}
              row={rows.get(region.id) ?? 0}
              compact={props.compact}
              next={nextFocusLink(shownRegions, region)}
              projection={props.projection}
              region={region}
              onLink={props.onLink}
              onSelectLink={props.onSelectLink}
            />
          ))}
        {props.regions.map((region) => (
          <ReviewZoomRegionBlock
            key={region.id}
            {...props}
            snapEdges={snapEdges}
            sourceSnapEdges={getSnapCandidates({
              edits,
              boundaries: [0, props.projection?.duration ?? duration, ...(props.snapTimes ?? [])],
              playhead: time === null ? null : (props.projection?.source(time) ?? time),
            })}
            row={rows.get(region.id) ?? 0}
            region={region}
            range={shownRange(region)}
            selected={props.selectedId === region.id}
            drag={drag}
            onPreview={(value) => setPreview(value && { id: region.id, ...value })}
            onGuide={setGuide}
          />
        ))}
        {props.sourceSelection?.kind === 'range' ? (
          <div
            aria-hidden="true"
            data-ui="gallery.videoReview.focusRangePreview"
            className="pointer-events-none absolute inset-y-0 z-20 border
              border-[var(--sniptale-color-accent)] bg-[var(--sniptale-color-accent)]/10"
            style={{
              left: `${(props.sourceSelection.start / sourceDuration) * 100}%`,
              width: `${((props.sourceSelection.end - props.sourceSelection.start) / sourceDuration) * 100}%`,
            }}
          />
        ) : null}
        <ReviewTrackCuts projection={props.projection} />
        {guide !== null ? (
          <div
            aria-hidden="true"
            data-zoom-guide="true"
            className="pointer-events-none absolute inset-y-0 z-20 w-px
              bg-[var(--sniptale-color-accent-emphasis)]"
            style={{
              left: `${(guide / sourceDuration) * 100}%`,
            }}
          />
        ) : null}
      </div>
    </ReviewTrackRow>
  );
}

/**
 * One gap affordance between active consecutive regions: an unlinked gap connects on
 * click; a connected gap selects its link settings instead of silently unlinking.
 */
function ReviewZoomGapLink(props: {
  compact?: boolean | undefined;
  row: number;
  duration: number;
  enabled?: boolean | undefined;
  linkSelectedId?: string | null | undefined;
  next: QuickEditZoomRegion | undefined;
  projection: ReviewTrackProjection | undefined;
  region: QuickEditZoomRegion;
  onLink: ((id: string, targetId: string | null) => void) | undefined;
  onSelectLink: ((id: string) => void) | undefined;
}) {
  const { next, region } = props;
  if (!next || next.start <= region.end || quickEditFocusType(region) === 'border') return null;
  if (cutCrossesFocusLink(region, next, props.projection)) return null;
  if (props.enabled === false || (!props.onLink && !props.onSelectLink)) return null;
  const left = props.projection?.position(region.end, 'end') ?? region.end / props.duration;
  const right = props.projection?.position(next.start) ?? next.start / props.duration;
  if (!(right - left > 0)) return null;
  const connected = region.linkTo === next.id;
  const label = translate(
    connected ? 'gallery.videoReview.zoomLinkSettings' : 'gallery.videoReview.zoomConnect'
  );
  return (
    <button
      type="button"
      data-ui="gallery.videoReview.zoomLink"
      title={label}
      data-connected={connected ? 'true' : 'false'}
      aria-label={label}
      aria-pressed={props.linkSelectedId === region.id}
      className={`group absolute inset-y-1 z-[6] flex items-center justify-center rounded border
        focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--sniptale-color-accent)]
        ${
          props.linkSelectedId === region.id
            ? reviewTimelineItemTone(true, 'focus')
            : connected
              ? reviewTimelineItemTone(false, 'focus')
              : `border-dashed border-transparent hover:border-[var(--sniptale-color-border-soft)]
                  focus-visible:border-[var(--sniptale-color-border-soft)]
                  text-[var(--sniptale-color-text-muted)] hover:bg-[var(--sniptale-color-surface-hover)]`
        }`}
      style={{
        left: `${left * 100}%`,
        width: `${(right - left) * 100}%`,
        top:
          props.row * reviewTrackMetrics(props.compact).step +
          reviewTrackMetrics(props.compact).inset +
          (props.compact ? 2 : 4),
        height: props.compact ? 20 : 24,
        bottom: 'auto',
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={() => {
        if (!connected) props.onLink?.(region.id, next.id);
        props.onSelectLink?.(region.id);
      }}
    >
      {connected ? (
        <MoveRight size={16} aria-hidden="true" />
      ) : (
        <MoveRight
          size={16}
          aria-hidden="true"
          className="opacity-0 transition-opacity group-hover:opacity-100
            group-focus-visible:opacity-100"
        />
      )}
    </button>
  );
}

function cutCrossesFocusLink(
  region: QuickEditZoomRegion,
  next: QuickEditZoomRegion,
  projection: ReviewTrackProjection | undefined
): boolean {
  const from = region.sourceAnchor;
  const to = next.sourceAnchor;
  return (
    !!from &&
    !!to &&
    !!projection?.cuts.some((cut) => cut.sourceStart < to.start && cut.sourceEnd > from.end)
  );
}

/** Authored and transient source anchors retain the plate geometry under cuts. */
function reviewZoomBlockPresentation(
  props: ZoomTrackProps & {
    region: QuickEditZoomRegion;
    range: FocusRange;
  }
) {
  const { region, range, projection, duration } = props;
  const anchor = range.sourceAnchor;
  const cutOverlap =
    !!anchor &&
    props.edits.some(
      (edit) => edit.kind === 'cut' && edit.start < anchor.end && edit.end > anchor.start
    );
  const authored = !!anchor;
  const sourceDuration = projection?.duration ?? duration;
  const left = authored
    ? anchor.start / sourceDuration
    : (projection?.position(range.start) ?? range.start / duration);
  const right = authored
    ? anchor.end / sourceDuration
    : (projection?.position(range.end, 'end') ?? range.end / duration);
  const kindLabel = translate(
    region.border
      ? 'gallery.videoReview.focusBorder'
      : region.spotlight
        ? 'gallery.videoReview.focusSpotlight'
        : 'gallery.videoReview.zoomRegionLabel'
  );
  const label =
    `${kindLabel} ` +
    `${reviewTimeLabel(anchor?.start ?? region.start)} – ${reviewTimeLabel(anchor?.end ?? region.end)}` +
    (cutOverlap ? ` · ${translate('gallery.videoReview.cutOverlapHint')}` : '');
  return {
    cutOverlap,
    label,
    style: { left: `${left * 100}%`, width: `${(right - left) * 100}%` },
  };
}

/** Focus gestures preserve source-frame width across cuts and video Speed. */
function projectFocusDrag(
  props: ZoomTrackProps & {
    region: QuickEditZoomRegion;
    snapEdges: readonly number[];
    sourceSnapEdges: readonly number[];
  },
  current: ZoomDragState,
  pixels: number,
  bypass: boolean
): FocusRange & { guide: number | null } {
  const projection = props.projection;
  const axis = projection?.focus;
  const anchored = (region: QuickEditZoomRegion) => {
    if (!projection) return region;
    const source = region.sourceAnchor ?? {
      start: projection.source(region.start),
      end: projection.source(region.end, 'end'),
    };
    return { ...region, start: source.start, end: source.end };
  };
  const region = anchored(props.region);
  const next = zoomDragRange({
    edge: current.edge,
    delta:
      axis?.delta(current.sourceAtPointer, pixels, current.width) ??
      (pixels / current.width) * props.duration,
    length: region.end - region.start,
    region,
    duration: axis?.resultDuration ?? props.duration,
    widthPx: current.width,
    projection: axis,
    bypass,
    snapEdges: projection ? props.sourceSnapEdges : props.snapEdges,
    regions: props.regions.map(anchored),
  });
  const guide = next.guide;
  if (!projection) return { start: next.start, end: next.end, guide };
  const sourceAnchor = {
    start: next.start,
    end: next.end,
  };
  const start = projection.output(sourceAnchor.start);
  const end = projection.output(sourceAnchor.end);
  return {
    ...(start < end ? { start, end } : { start: props.region.start, end: props.region.end }),
    sourceAnchor,
    guide,
  };
}

function ReviewZoomRegionBlock(
  props: ZoomTrackProps & {
    row: number;
    region: QuickEditZoomRegion;
    range: FocusRange;
    selected: boolean;
    drag: React.RefObject<ZoomDragState | null>;
    snapEdges: readonly number[];
    sourceSnapEdges: readonly number[];
    onPreview(range: FocusRange | null): void;
    onGuide(guide: number | null): void;
  }
) {
  const { region, duration, onPreview, onGuide } = props;
  const { cutOverlap, label, style } = reviewZoomBlockPresentation(props);
  const locale = useAppLocale();
  const scaleLabel = `${formatNumber(region.transform.scale, { maximumFractionDigits: 1 }, locale)}×`;
  const tone = reviewTimelineItemTone(props.selected, 'focus');
  const cancel = () => {
    if (!props.drag.current) return;
    props.drag.current.admission.cancel();
    props.drag.current = null;
    onPreview(null);
    onGuide(null);
  };
  const begin = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const admission = deferReviewGesture(props.beforeAction, () => props.onSelect(region.id));
    const target = event.target;
    const edge =
      target instanceof Element
        ? target.closest('[data-zoom-edge]')?.getAttribute('data-zoom-edge')
        : null;
    props.drag.current = {
      admission,
      id: region.id,
      x: event.clientX,
      sourceAtPointer:
        ((event.clientX - event.currentTarget.parentElement!.getBoundingClientRect().left) /
          event.currentTarget.parentElement!.getBoundingClientRect().width) *
        (props.projection?.duration ?? duration),
      width: event.currentTarget.parentElement!.getBoundingClientRect().width,
      edge: edge === 'start' || edge === 'end' ? edge : 'move',
      range: props.range,
      length: region.end - region.start,
      moved: false,
      node: event.currentTarget,
      pointerId: event.pointerId,
    };
    onPreview(props.drag.current.range);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  return (
    <div
      role="button"
      data-cut-suppressed={cutOverlap ? 'true' : 'false'}
      data-review-removal-key={`focus:${region.id}`}
      tabIndex={0}
      aria-label={label}
      title={`${label}${region.spotlight || region.border ? '' : ` · ${scaleLabel}`}`}
      aria-pressed={props.selected}
      className={`absolute inset-y-0 z-[5] cursor-grab rounded border text-xs
          active:cursor-grabbing ${tone}`}
      style={{
        ...style,
        top:
          props.row * reviewTrackMetrics(props.compact).step +
          reviewTrackMetrics(props.compact).inset,
        height: reviewTrackMetrics(props.compact).body,
        bottom: 'auto',
      }}
      onPointerDown={begin}
      onPointerMove={(event) => {
        const current = props.drag.current;
        if (!current || current.width <= 0) return;
        current.moved ||= Math.abs(event.clientX - current.x) > 3;
        const next = projectFocusDrag(props, current, event.clientX - current.x, event.altKey);
        onGuide(current.edge === 'move' ? next.guide : null);
        if (next.start < next.end) {
          const { guide: _guide, ...range } = next;
          current.range = range;
          onPreview(range);
        }
      }}
      onPointerUp={(event) => {
        const current = props.drag.current;
        props.drag.current = null;
        onPreview(null);
        onGuide(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        if (current?.moved)
          current.admission.commit(() =>
            current.range.sourceAnchor
              ? props.onDragCommit(
                  current.id,
                  { start: current.range.start, end: current.range.end },
                  current.edge,
                  current.range.sourceAnchor
                )
              : props.onDragCommit(current.id, current.range, current.edge)
          );
      }}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        (props.beforeAction ?? ((action) => action()))(() => props.onSelect(region.id));
      }}
    >
      <span className="pointer-events-none absolute inset-y-0 inset-x-3 text-[10px]">
        <ReviewTimelineLabel
          icon={
            region.border ? (
              <RectangleHorizontal size={13} aria-hidden="true" />
            ) : region.spotlight ? (
              <ScanEye size={13} />
            ) : (
              <Focus size={13} />
            )
          }
          name={translate(
            region.border
              ? 'gallery.videoReview.focusBorder'
              : region.spotlight
                ? 'gallery.videoReview.focusSpotlight'
                : 'gallery.videoReview.zoomRegionLabel'
          )}
          value={region.spotlight || region.border ? undefined : scaleLabel}
        />
      </span>
      {(['start', 'end'] as const).map((edge) => (
        <span
          key={edge}
          data-zoom-edge={edge}
          style={{ maxWidth: '50%' }}
          className={`${reviewTimelineResizeHandleClassName}
              ${edge === 'start' ? 'left-0' : 'right-0'}`}
        >
          <span aria-hidden="true" className="h-4 w-px bg-current opacity-60" />
        </span>
      ))}
    </div>
  );
}

/** The shared resolver rejects every intervening focus, including other types. */
function nextFocusLink(regions: readonly QuickEditZoomRegion[], region: QuickEditZoomRegion) {
  if (quickEditFocusType(region) === 'border') return undefined;
  const linked = resolveQuickEditFocusLink(regions, region.id);
  if (linked) return linked.target;
  const candidates = regions
    .filter(
      (item) =>
        !item.dormant &&
        item.id !== region.id &&
        quickEditFocusType(item) === quickEditFocusType(region) &&
        item.start > region.end
    )
    .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  const target = candidates[0];
  if (!target) return undefined;
  return resolveQuickEditFocusLink(
    regions.map((item) => (item.id === region.id ? { ...item, linkTo: target.id } : item)),
    region.id
  )?.target;
}
