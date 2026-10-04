import { createQuickEditSpotlight } from '../../features/video/review/advanced/focus';
import { useEffect, useState } from 'react';
import type {
  QuickEditAdvancedState,
  QuickEditZoomRegion,
} from '../../features/video/review/advanced/types';
import {
  projectReviewFocus,
  reviewFocusSourceRange,
} from '../../features/video/review/focus-edits';
import type { ReviewTimeSegment } from '../../features/video/review/timeline';
import {
  availableQuickEditZoomRange,
  createQuickEditZoomRegion,
  fitQuickEditZoomTransitions,
  insertQuickEditZoomRegion,
  moveQuickEditZoomRegion,
  trimQuickEditZoomRegion,
  updateQuickEditZoomRegion,
  type QuickEditZoomRegionPatch,
} from '../../features/video/review/advanced/zoom';

type ZoomState = QuickEditAdvancedState['zoom'];

function sourceAnchorPatch(
  range: Pick<QuickEditZoomRegion, 'start' | 'end'>,
  timeMap?: readonly ReviewTimeSegment[]
): Pick<QuickEditZoomRegion, 'sourceAnchor'> {
  const anchor = timeMap ? reviewFocusSourceRange(range, timeMap) : null;
  return anchor ? { sourceAnchor: anchor } : {};
}

/** A revived placement must fit among active neighbors or it stays dormant. */
function fitsActiveWindow(zoom: ZoomState, id: string, start: number, end: number) {
  if (!(start < end)) return false;
  return !zoom.regions.some(
    (other) => !other.dormant && other.id !== id && start < other.end && end > other.start
  );
}

/** Bounded region changes; a colliding dormant placement keeps its stored values. */
function applyZoomChange(
  timelineDuration: number,
  zoom: ZoomState,
  id: string,
  patch: QuickEditZoomRegionPatch,
  timeMap?: readonly ReviewTimeSegment[]
): ZoomState {
  const originalRegion = zoom.regions.find((region) => region.id === id);
  if (!originalRegion) return zoom;
  let regions = zoom.regions;
  if (patch.start !== undefined) {
    const start = patch.start;
    regions = regions.map((region) => {
      if (region.id !== id) return region;
      const range = trimQuickEditZoomRegion({
        regions,
        id,
        edge: 'start',
        time: start,
        timelineDuration,
      });
      if (!fitsActiveWindow(zoom, id, range.start, region.end)) return region;
      return { ...region, start: range.start, dormant: false };
    });
  }
  if (patch.end !== undefined) {
    const end = patch.end;
    regions = regions.map((region) => {
      if (region.id !== id) return region;
      const range = trimQuickEditZoomRegion({
        regions,
        id,
        edge: 'end',
        time: end,
        timelineDuration,
      });
      if (!fitsActiveWindow(zoom, id, region.start, range.end)) return region;
      return { ...region, end: range.end, dormant: false };
    });
  }
  if (patch.start !== undefined || patch.end !== undefined) {
    regions = regions.map((region) =>
      region.id === id
        ? fitQuickEditZoomTransitions({ ...region, ...sourceAnchorPatch(region, timeMap) })
        : region
    );
  }
  const { start: _startPatch, end: _endPatch, ...rest } = patch;
  // Any user-authored edit proves result-time intent and revives a dormant
  // placement, unless its stored interval collides with an active neighbor.
  const updated = updateQuickEditZoomRegion(regions, id, rest);
  const revived = updated.find((region) => region.id === id);
  regions =
    revived && fitsActiveWindow(zoom, id, revived.start, revived.end)
      ? updated.map((region) => (region.id === id ? { ...region, dormant: false } : region))
      : updated.map((region) => (region.id === id ? originalRegion : region));
  return { ...zoom, regions };
}

/** Source-intent commits validate current neighbors before projecting the visible result cache. */
function applySourceZoomCommit(
  zoom: ZoomState,
  id: string,
  sourceAnchor: NonNullable<QuickEditZoomRegion['sourceAnchor']>,
  timeMap: readonly ReviewTimeSegment[]
): ZoomState {
  const region = zoom.regions.find((item) => item.id === id);
  const { start, end } = sourceAnchor;
  if (
    !region ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end <= start ||
    end > (timeMap.at(-1)?.sourceEnd ?? 0)
  )
    return zoom;
  const collision = zoom.regions.some((other) => {
    if (other.id === id || other.dormant) return false;
    const anchor = other.sourceAnchor ?? reviewFocusSourceRange(other, timeMap);
    return !!anchor && start < anchor.end && end > anchor.start;
  });
  if (collision) return zoom;
  const authored = fitQuickEditZoomTransitions({ ...region, sourceAnchor, dormant: false });
  const visible = projectReviewFocus([authored], timeMap);
  const updated = {
    ...authored,
    ...(visible.length ? { start: visible[0]!.start, end: visible.at(-1)!.end } : {}),
  };
  return { ...zoom, regions: zoom.regions.map((item) => (item.id === id ? updated : item)) };
}

/** Drag commits follow the same revival rules as inspector changes. */
function applyZoomCommit(
  timelineDuration: number,
  zoom: ZoomState,
  id: string,
  range: { start: number; end: number },
  edge: 'start' | 'end' | 'move',
  timeMap?: readonly ReviewTimeSegment[]
): ZoomState {
  const region = zoom.regions.find((item) => item.id === id);
  if (!region) return zoom;
  if (edge === 'move') {
    const moved = moveQuickEditZoomRegion({
      regions: zoom.regions,
      id,
      requestedStart: range.start,
      timelineDuration,
    });
    if (!fitsActiveWindow(zoom, id, moved.start, moved.end)) return zoom;
    return {
      ...zoom,
      regions: zoom.regions.map((item) =>
        item.id === id
          ? fitQuickEditZoomTransitions({
              ...item,
              ...moved,
              dormant: false,
              ...sourceAnchorPatch(moved, timeMap),
            })
          : item
      ),
    };
  }
  const trimmed = trimQuickEditZoomRegion({
    regions: zoom.regions,
    id,
    edge,
    time: edge === 'start' ? range.start : range.end,
    timelineDuration,
  });
  if (!fitsActiveWindow(zoom, id, trimmed.start, trimmed.end)) return zoom;
  return {
    ...zoom,
    regions: zoom.regions.map((item) =>
      item.id === id
        ? fitQuickEditZoomTransitions({
            ...item,
            start: trimmed.start,
            end: trimmed.end,
            dormant: false,
            ...sourceAnchorPatch(trimmed, timeMap),
          })
        : item
    ),
  };
}

type ZoomEditorArgs = {
  setZoom(update: (zoom: ZoomState) => ZoomState): void;
  zoom: ZoomState;
  timelineDuration: number;
  timeMap?: readonly ReviewTimeSegment[];
  selection?: string | null;
  onSelectionChange?(id: string | null): void;
  /** Transient gap-link selection; lives beside the region selection, never persisted. */
  linkSelection?: string | null;
  onLinkSelectionChange?(id: string | null): void;
};

/** Create or select the region at the playhead without changing hook-owned selection state. */
function addZoomAt(args: ZoomEditorArgs, at: number, timelineDuration: number): string | null {
  const part = args.timeMap?.find(
    (segment) => segment.kind !== 'cut' && at >= segment.resultStart && at < segment.resultEnd
  );
  if (args.timeMap && !part) return null;
  const sourceAt = part ? part.sourceStart + (at - part.resultStart) * part.rate : at;
  const sourceRegions = args.timeMap
    ? args.zoom.regions.map((region) => ({
        ...region,
        ...(region.sourceAnchor ?? reviewFocusSourceRange(region, args.timeMap!) ?? region),
      }))
    : args.zoom.regions;
  const range = availableQuickEditZoomRange({
    regions: sourceRegions,
    at: sourceAt,
    timelineDuration: args.timeMap?.at(-1)?.sourceEnd ?? timelineDuration,
  });
  if (!range) {
    return (
      args.zoom.regions.find((region) => !region.dormant && at >= region.start && at < region.end)
        ?.id ?? null
    );
  }
  const region = createQuickEditZoomRegion({
    id: `zoom-${crypto.randomUUID()}`,
    at: range.start,
    duration: range.end - range.start,
    endMax: range.end,
  });
  const authored = args.timeMap ? { ...region, sourceAnchor: range } : region;
  const visible = projectReviewFocus([authored], args.timeMap);
  if (!visible.length) return null;
  const anchored = { ...authored, start: visible[0]!.start, end: visible.at(-1)!.end };
  args.setZoom((zoom) => ({
    ...zoom,
    enabled: true,
    regions: insertQuickEditZoomRegion(zoom.regions, anchored),
  }));
  return region.id;
}

/** One zoom-editing workflow owner: region selection, updates, and the stage focus overlay. */
export function useReviewZoomEditor(args: ZoomEditorArgs) {
  const [draft, setDraft] = useState<{
    id: string;
    patch: QuickEditZoomRegionPatch;
    base: string;
  } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [localSelection, setLocalSelection] = useState<string | null>(null);
  const selection = args.selection === undefined ? localSelection : args.selection;
  useEffect(() => {
    setDraft(null);
  }, [selection]);
  const setSelection = (id: string | null) => {
    if (args.selection === undefined) setLocalSelection(id);
    args.onSelectionChange?.(id);
  };
  const [localLinkSelection, setLocalLinkSelection] = useState<string | null>(null);
  const linkSelection = args.linkSelection === undefined ? localLinkSelection : args.linkSelection;
  const setLinkSelection = (id: string | null) => {
    if (args.linkSelection === undefined) setLocalLinkSelection(id);
    args.onLinkSelectionChange?.(id);
  };
  const add = (at: number, timelineDuration: number) => {
    const id = addZoomAt(args, at, timelineDuration);
    if (id) setSelection(id);
  };
  const remove = (id: string) => {
    args.setZoom((zoom) => ({
      ...zoom,
      regions: zoom.regions.filter((item) => item.id !== id),
    }));
    setSelection(selection === id ? null : selection);
  };
  const resetPosition = (id: string) =>
    args.setZoom((zoom) => {
      const spotlight = zoom.regions.find((region) => region.id === id)?.spotlight;
      return {
        ...zoom,
        regions: updateQuickEditZoomRegion(zoom.regions, id, {
          centerX: 0.5,
          centerY: 0.5,
          ...(spotlight
            ? { spotlight: { ...spotlight, area: createQuickEditSpotlight().area } }
            : {}),
        }),
      };
    });
  const change = (id: string, patch: QuickEditZoomRegionPatch) => {
    setDraft(null);
    args.setZoom((zoom) => applyZoomChange(args.timelineDuration, zoom, id, patch, args.timeMap));
  };
  const preview = (id: string, patch: QuickEditZoomRegionPatch | null) =>
    setDraft(
      patch
        ? { id, patch, base: focusRevision(args.zoom.regions.find((item) => item.id === id)) }
        : null
    );
  const previewRegion = (region: QuickEditZoomRegion): QuickEditZoomRegion =>
    draft &&
    draft.id === selection &&
    draft.id === region.id &&
    draft.base === focusRevision(region)
      ? updateQuickEditZoomRegion([region], region.id, draft.patch)[0]!
      : region;
  const commitDrag = (
    id: string,
    range: { start: number; end: number },
    edge: 'start' | 'end' | 'move',
    sourceAnchor?: QuickEditZoomRegion['sourceAnchor']
  ) =>
    args.setZoom((zoom) =>
      sourceAnchor && args.timeMap
        ? applySourceZoomCommit(zoom, id, sourceAnchor, args.timeMap)
        : applyZoomCommit(args.timelineDuration, zoom, id, range, edge, args.timeMap)
    );
  const selected = (zoom: ZoomState): QuickEditZoomRegion | null =>
    zoom.regions.find((item) => item.id === selection) ?? null;
  return {
    drawing,
    setDrawing,
    selection,
    setSelection,
    linkSelection,
    setLinkSelection,
    add,
    addRegion: (region: QuickEditZoomRegion) => {
      if (
        !(region.start >= 0 && region.end <= args.timelineDuration && region.start < region.end) ||
        !fitsActiveWindow(args.zoom, region.id, region.start, region.end)
      )
        return null;
      const created = fitQuickEditZoomTransitions({
        ...region,
        id: `zoom-${crypto.randomUUID()}`,
        ...sourceAnchorPatch(region, args.timeMap),
      });
      args.setZoom((zoom) => ({
        ...zoom,
        enabled: true,
        regions: insertQuickEditZoomRegion(zoom.regions, created),
      }));
      setSelection(created.id);
      return created.id;
    },
    remove,
    resetPosition,
    change,
    commitDrag,
    selected,
    preview,
    previewRegion,
    toggleEnabled: () => args.setZoom((zoom) => ({ ...zoom, enabled: !zoom.enabled })),
  };
}

/** Autosave acknowledgement changes object identity, not the authored focus target. */
function focusRevision(region: QuickEditZoomRegion | undefined): string {
  if (!region) return '';
  const { transform: camera, spotlight: mask, enter, exit } = region;
  return JSON.stringify([
    region.id,
    region.start,
    region.end,
    region.dormant,
    region.linkTo,
    region.linkEasing,
    camera.scale,
    camera.centerX,
    camera.centerY,
    enter.type,
    enter.duration,
    exit.type,
    exit.duration,
    mask && [
      mask.effect,
      mask.strength,
      mask.blur,
      mask.roundness,
      mask.reveal,
      mask.exitReveal,
      mask.area.x,
      mask.area.y,
      mask.area.width,
      mask.area.height,
    ],
  ]);
}
