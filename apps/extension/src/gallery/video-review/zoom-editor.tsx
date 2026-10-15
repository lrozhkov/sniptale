import { createQuickEditBorder } from '../../features/video/review/advanced/border';
import { quickEditFocusConflicts } from '../../features/video/review/advanced/focus-layout';
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
function fitsActiveWindow(
  zoom: ZoomState,
  region: QuickEditZoomRegion,
  start: number,
  end: number,
  timeMap?: readonly ReviewTimeSegment[]
) {
  return (
    start < end &&
    !quickEditFocusConflicts(zoom.regions, {
      ...region,
      start,
      end,
      dormant: false,
      ...sourceAnchorPatch({ start, end }, timeMap),
    })
  );
}

export type ReviewFocusType = 'zoom' | 'spotlight' | 'border';

/** Disposable insertion choice does not alter the stored camera. */
export function withReviewFocusType(
  region: QuickEditZoomRegion,
  type: ReviewFocusType
): QuickEditZoomRegion {
  if (type === 'border' && region.border) return region;
  const { spotlight, border, ...camera } = region;
  const area = spotlight ?? border;
  return type === 'zoom'
    ? camera
    : type === 'spotlight'
      ? {
          ...camera,
          spotlight: {
            ...createQuickEditSpotlight(),
            ...(area ? { area: area.area, roundness: area.roundness } : {}),
          },
        }
      : fitQuickEditZoomTransitions({
          ...camera,
          enter: { type: 'ease-in-out', duration: 1 },
          border: {
            ...createQuickEditBorder(),
            ...(area ? { area: area.area, roundness: area.roundness } : {}),
          },
        });
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
  // Property edits keep an active source placement; cut-hidden result caches are not neighbors.
  if (!originalRegion.dormant && patch.start === undefined && patch.end === undefined)
    return { ...zoom, regions: updateQuickEditZoomRegion(zoom.regions, id, patch) };
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
      if (!fitsActiveWindow(zoom, region, range.start, region.end, timeMap)) return region;
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
      if (!fitsActiveWindow(zoom, region, region.start, range.end, timeMap)) return region;
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
  if (!revived) return zoom;
  const intended = {
    ...revived,
    dormant: false,
    ...(originalRegion.dormant ? sourceAnchorPatch(revived, timeMap) : {}),
  };
  if (!fitsActiveWindow(zoom, intended, intended.start, intended.end)) return zoom;
  return {
    ...zoom,
    regions: updated.map((region) => (region.id === id ? intended : region)),
  };
}

/** Reset effect parameters while preserving its authored interval, kind and link relationship. */
function resetFocusSettings(zoom: ZoomState, id: string): ZoomState {
  const selected = zoom.regions.find((region) => region.id === id);
  if (!selected) return zoom;
  const defaults = withReviewFocusType(
    createQuickEditZoomRegion({
      id,
      at: selected.start,
      duration: selected.end - selected.start,
      endMax: selected.end,
      ...(selected.sourceAnchor ? { sourceAnchor: selected.sourceAnchor } : {}),
    }),
    selected.border ? 'border' : selected.spotlight ? 'spotlight' : 'zoom'
  );
  const reset = fitQuickEditZoomTransitions({
    ...defaults,
    ...(selected.followCursor === undefined ? {} : { followCursor: selected.followCursor }),
    ...(selected.dormant !== undefined ? { dormant: selected.dormant } : {}),
    ...(selected.linkTo ? { linkTo: selected.linkTo } : {}),
  });
  return { ...zoom, regions: zoom.regions.map((region) => (region.id === id ? reset : region)) };
}

/** Spatial gestures admit one captured authored target against the current mutation state. */
function applyZoomChangeAtRevision(
  args: Pick<ZoomEditorArgs, 'timelineDuration' | 'timeMap'>,
  zoom: ZoomState,
  id: string,
  revision: string,
  patch: QuickEditZoomRegionPatch
): ZoomState {
  const region = zoom.regions.find((item) => item.id === id);
  if (
    !zoom.enabled ||
    !region ||
    region.dormant ||
    region.border ||
    region.spotlight ||
    focusRevision(region) !== revision
  )
    return zoom;
  const next = applyZoomChange(args.timelineDuration, zoom, id, patch, args.timeMap);
  return next.regions.every(
    (item, index) => focusRevision(item) === focusRevision(zoom.regions[index])
  )
    ? zoom
    : next;
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
  const collision = quickEditFocusConflicts(
    zoom.regions.map((item) => ({
      ...item,
      ...(!item.sourceAnchor ? sourceAnchorPatch(item, timeMap) : {}),
    })),
    {
      ...region,
      sourceAnchor,
      dormant: false,
    }
  );
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
    if (!fitsActiveWindow(zoom, region, moved.start, moved.end, timeMap)) return zoom;
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
  if (!fitsActiveWindow(zoom, region, trimmed.start, trimmed.end, timeMap)) return zoom;
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
  setEnabled?(enabled: boolean): void;
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
function addZoomAt(
  args: ZoomEditorArgs,
  at: number,
  timelineDuration: number,
  type: ReviewFocusType
): string | null {
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
    regions: type === 'zoom' ? sourceRegions : [],
    at: sourceAt,
    timelineDuration: args.timeMap?.at(-1)?.sourceEnd ?? timelineDuration,
  });
  if (!range) {
    return (
      args.zoom.regions.find((region) => !region.dormant && at >= region.start && at < region.end)
        ?.id ?? null
    );
  }
  const region = withReviewFocusType(
    createQuickEditZoomRegion({
      id: `zoom-${crypto.randomUUID()}`,
      at: range.start,
      duration: range.end - range.start,
      endMax: range.end,
    }),
    type
  );
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

/** Copies authored overlay content through the same history/autosave mutation as other edits. */
function duplicateFocus(args: ZoomEditorArgs, id: string): string | null {
  const original = args.zoom.regions.find((item) => item.id === id);
  if (!original || original.dormant || (!original.border && !original.spotlight)) return null;
  const { linkTo: _link, linkEasing: _easing, borderClock: _clock, ...values } = original;
  const copy = { ...structuredClone(values), id: `zoom-${crypto.randomUUID()}` };
  args.setZoom((zoom) => ({
    ...zoom,
    regions: insertQuickEditZoomRegion(zoom.regions, copy),
  }));
  return copy.id;
}

/** One zoom-editing workflow owner: region selection, updates, and the stage focus overlay. */
export function useReviewZoomEditor(args: ZoomEditorArgs) {
  const [draft, setDraft] = useState<{
    id: string;
    patch: QuickEditZoomRegionPatch;
    base: string;
  } | null>(null);
  const [insertionType, setInsertionType] = useState<ReviewFocusType>('zoom');
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
    const id = addZoomAt(args, at, timelineDuration, insertionType);
    if (id) setSelection(id);
  };
  const remove = (id: string) => {
    args.setZoom((zoom) => ({
      ...zoom,
      regions: zoom.regions.filter((item) => item.id !== id),
    }));
    setSelection(selection === id ? null : selection);
  };
  const resetPosition = (id: string) => args.setZoom((zoom) => resetFocusSettings(zoom, id));
  const change = (id: string, patch: QuickEditZoomRegionPatch) => {
    setDraft(null);
    args.setZoom((zoom) => applyZoomChange(args.timelineDuration, zoom, id, patch, args.timeMap));
  };
  /** Spatial gestures admit their captured authored target inside the latest-state mutation. */
  const changeAtRevision = (id: string, revision: string, patch: QuickEditZoomRegionPatch) => {
    setDraft(null);
    args.setZoom((zoom) => applyZoomChangeAtRevision(args, zoom, id, revision, patch));
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
    insertionType,
    setInsertionType,
    drawing,
    setDrawing,
    selection,
    setSelection,
    linkSelection,
    setLinkSelection,
    add,
    addRegion: (candidate: QuickEditZoomRegion) => {
      const region = withReviewFocusType(candidate, insertionType);
      if (
        !(region.start >= 0 && region.end <= args.timelineDuration && region.start < region.end) ||
        quickEditFocusConflicts(args.zoom.regions, {
          ...region,
          ...sourceAnchorPatch(region, args.timeMap),
        })
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
    duplicate: (id: string) => {
      const copyId = duplicateFocus(args, id);
      if (!copyId) return null;
      setDraft(null);
      setLinkSelection(null);
      setSelection(copyId);
      return copyId;
    },
    remove,
    resetPosition,
    change,
    changeAtRevision,
    revision: focusRevision,
    commitDrag,
    selected,
    canConvertToZoom: (region: QuickEditZoomRegion) =>
      fitsActiveWindow(
        args.zoom,
        withReviewFocusType(region, 'zoom'),
        region.start,
        region.end,
        region.dormant ? args.timeMap : undefined
      ),
    preview,
    previewRegion,
    toggleEnabled: () =>
      args.setEnabled
        ? args.setEnabled(!args.zoom.enabled)
        : args.setZoom((zoom) => ({ ...zoom, enabled: !zoom.enabled })),
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
    region.sourceAnchor,
    region.dormant,
    region.motionBlur,
    region.border,
    region.perspective,
    region.depthOfField,
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
