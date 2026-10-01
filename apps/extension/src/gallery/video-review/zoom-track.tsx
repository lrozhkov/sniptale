import { deferReviewGesture, type ReviewBeforeAction } from './note-transitions';
import { ReviewTimelineLabel } from './timeline-label';
import { reviewTimelineItemTone, reviewTimelineResizeHandleClassName } from './controls';
import { ScanEye } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { MoveRight, Plus, Focus, Eye, EyeOff } from 'lucide-react';
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
import {
  reviewTrackStatusButtonClassName,
  reviewIconButtonClassName,
  ReviewButton,
  reviewTimeLabel,
} from './controls';
import type { ReviewTrackProjection } from './track-projection';
import { ReviewTrackRow, ReviewTrackCuts } from './track-row';
import { useReviewDragEscape } from './timeline-drag';

type ZoomTrackProps = {
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
  boundaries: readonly number[] | undefined;
  /** Source-to-result projection; removed source points return null. */
  toOutputTime(source: number): number | null;
  selectedId: string | null;
  onSelect(id: string | null): void;
  onAdd(): void;
  onLink?(id: string, targetId: string | null): void;
  /** Transient connection-settings selection; a linked gap opens it instead of unlinking. */
  linkSelectedId?: string | null;
  onSelectLink?(id: string): void;
  onDragCommit(
    id: string,
    range: { start: number; end: number },
    edge: 'start' | 'end' | 'move'
  ): void;
};

interface ZoomDragState {
  admission: ReturnType<typeof deferReviewGesture>;
  id: string;
  x: number;
  sourceAtPointer: number;
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
  projection?: ReviewTrackProjection | undefined;
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
    projection?: ReviewTrackProjection | undefined;
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

/** Zoom regions on their own lane; drags snap to shared candidates and never overlap. */
export function ReviewZoomTrack(props: ZoomTrackProps) {
  const sourceDuration = props.projection?.duration ?? props.duration;
  const [guide, setGuide] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ id: string; start: number; end: number } | null>(null);
  const drag = useRef<ZoomDragState | null>(null);
  useReviewDragEscape(drag, () => {
    setPreview(null);
    setGuide(null);
  });
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
    <ReviewTrackRow
      muted={props.enabled === false}
      label={translate('gallery.videoReview.zoomTrack')}
      icon={<Focus size={14} aria-hidden="true" />}
      controls={
        <>
          <ReviewButton
            label={translate('gallery.videoReview.zoomAdd')}
            className={`${reviewIconButtonClassName} !h-7 !min-h-7 !w-7 !px-1`}
            onClick={props.onAdd}
          >
            <Plus size={14} />
          </ReviewButton>
          {props.onToggleEnabled ? (
            <ReviewButton
              label={translate('gallery.videoReview.zoomEnabled')}
              aria-pressed={props.enabled !== false}
              onClick={props.onToggleEnabled}
              className={`${reviewTrackStatusButtonClassName} !h-7 !min-h-7 !w-7 !px-1`}
            >
              {props.enabled === false ? <EyeOff size={14} /> : <Eye size={14} />}
            </ReviewButton>
          ) : null}
        </>
      }
    >
      <div
        data-ui="gallery.videoReview.zoomLane"
        className="relative mt-1 h-8 rounded bg-[var(--sniptale-color-surface-hover)]"
      >
        {props.regions
          .filter((region) => !region.dormant)
          .map((region, index, regions) => (
            <ReviewZoomGapLink
              key={`link:${region.id}`}
              duration={props.duration}
              enabled={props.enabled}
              linkSelectedId={props.linkSelectedId}
              next={regions[index + 1]}
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
              left: `${(props.projection?.position(guide) ?? guide / props.duration) * 100}%`,
            }}
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
      </div>
    </ReviewTrackRow>
  );
}

/**
 * One gap affordance between active consecutive regions: an unlinked gap connects on
 * click; a connected gap selects its link settings instead of silently unlinking.
 */
function ReviewZoomGapLink(props: {
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
  if (!next || next.start <= region.end || !!next.spotlight !== !!region.spotlight) return null;
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
      style={{ left: `${left * 100}%`, width: `${(right - left) * 100}%` }}
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

/** Source width stays visible under cuts; preview drags use the result-time projection. */
function reviewZoomBlockPresentation(
  props: ZoomTrackProps & {
    region: QuickEditZoomRegion;
    range: { start: number; end: number };
  }
) {
  const { region, range, projection, duration } = props;
  const anchor = region.sourceAnchor;
  const cutOverlap =
    !!anchor &&
    props.edits.some(
      (edit) => edit.kind === 'cut' && edit.start < anchor.end && edit.end > anchor.start
    );
  const authored = !!anchor && range.start === region.start && range.end === region.end;
  const sourceDuration = projection?.duration ?? duration;
  const left = authored
    ? anchor.start / sourceDuration
    : (projection?.position(range.start) ?? range.start / duration);
  const right = authored
    ? anchor.end / sourceDuration
    : (projection?.position(range.end, 'end') ?? range.end / duration);
  const label =
    `${translate(region.spotlight ? 'gallery.videoReview.focusSpotlight' : 'gallery.videoReview.zoomRegionLabel')} ` +
    `${reviewTimeLabel(anchor?.start ?? region.start)} – ${reviewTimeLabel(anchor?.end ?? region.end)}` +
    (cutOverlap ? ` · ${translate('gallery.videoReview.cutOverlapHint')}` : '');
  return {
    cutOverlap,
    label,
    style: { left: `${left * 100}%`, width: `${(right - left) * 100}%` },
  };
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
  const { cutOverlap, label, style } = reviewZoomBlockPresentation(props);
  const locale = useAppLocale();
  const scaleLabel = `${formatNumber(region.transform.scale, { maximumFractionDigits: 1 }, locale)}×`;
  const tone = reviewTimelineItemTone(props.selected, 'focus');
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
      data-cut-suppressed={cutOverlap ? 'true' : 'false'}
      tabIndex={0}
      aria-label={label}
      title={`${label}${region.spotlight ? '' : ` · ${scaleLabel}`}`}
      aria-pressed={props.selected}
      className={`absolute inset-y-0 z-[5] cursor-grab rounded border text-xs
          active:cursor-grabbing ${tone}`}
      style={style}
      onPointerDown={begin}
      onPointerMove={(event) => {
        const current = props.drag.current;
        if (!current || current.width <= 0) return;
        current.moved ||= Math.abs(event.clientX - current.x) > 3;
        const next = zoomDragRange({
          edge: current.edge,
          delta:
            props.projection?.delta(
              current.sourceAtPointer,
              event.clientX - current.x,
              current.width
            ) ?? ((event.clientX - current.x) / current.width) * duration,
          length: current.length,
          region,
          duration,
          widthPx: current.width,
          projection: props.projection,
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
        if (current?.moved)
          current.admission.commit(() =>
            props.onDragCommit(current.id, current.range, current.edge)
          );
      }}
      onPointerCancel={() => {
        props.drag.current?.admission.cancel();
        props.drag.current = null;
        onPreview(null);
        onGuide(null);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        (props.beforeAction ?? ((action) => action()))(() => props.onSelect(region.id));
      }}
    >
      <span className="pointer-events-none absolute inset-y-0 inset-x-3 text-[10px]">
        <ReviewTimelineLabel
          icon={region.spotlight ? <ScanEye size={13} /> : <Focus size={13} />}
          name={translate(
            region.spotlight
              ? 'gallery.videoReview.focusSpotlight'
              : 'gallery.videoReview.zoomRegionLabel'
          )}
          value={region.spotlight ? undefined : scaleLabel}
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
