import { createQuickEditSpotlight } from '../../features/video/review/advanced/focus';
import { useEffect, useState } from 'react';
import type {
  QuickEditAdvancedState,
  QuickEditZoomRegion,
} from '../../features/video/review/advanced/types';
import {
  availableQuickEditZoomRange,
  createQuickEditZoomRegion,
  insertQuickEditZoomRegion,
  moveQuickEditZoomRegion,
  trimQuickEditZoomRegion,
  updateQuickEditZoomRegion,
  type QuickEditZoomRegionPatch,
} from '../../features/video/review/advanced/zoom';

type ZoomState = QuickEditAdvancedState['zoom'];

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
  patch: QuickEditZoomRegionPatch
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

/** Drag commits follow the same revival rules as inspector changes. */
function applyZoomCommit(
  timelineDuration: number,
  zoom: ZoomState,
  id: string,
  range: { start: number; end: number },
  edge: 'start' | 'end' | 'move'
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
        item.id === id ? { ...item, ...moved, dormant: false } : item
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
      item.id === id ? { ...item, start: trimmed.start, end: trimmed.end, dormant: false } : item
    ),
  };
}

/** One zoom-editing workflow owner: region selection, updates, and the stage focus overlay. */
export function useReviewZoomEditor(args: {
  setZoom(update: (zoom: ZoomState) => ZoomState): void;
  zoom: ZoomState;
  timelineDuration: number;
  selection?: string | null;
  onSelectionChange?(id: string | null): void;
  /** Transient gap-link selection; lives beside the region selection, never persisted. */
  linkSelection?: string | null;
  onLinkSelectionChange?(id: string | null): void;
}) {
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
  // A revived placement must fit among active neighbors or it stays dormant.
  const add = (at: number, timelineDuration: number) => {
    const range = availableQuickEditZoomRange({
      regions: args.zoom.regions,
      at,
      timelineDuration,
    });
    if (!range) {
      // Occupied playhead: point the editor at the existing region instead of
      // inserting an overlapping one; EOF refuses silently.
      const existing = args.zoom.regions.find(
        (region) => !region.dormant && at >= region.start && at < region.end
      );
      if (existing) setSelection(existing.id);
      return;
    }
    const region = createQuickEditZoomRegion({
      id: `zoom-${crypto.randomUUID()}`,
      at: range.start,
      duration: range.end - range.start,
      endMax: range.end,
    });
    args.setZoom((zoom) => ({
      ...zoom,
      enabled: true,
      regions: insertQuickEditZoomRegion(zoom.regions, region),
    }));
    setSelection(region.id);
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
    args.setZoom((zoom) => applyZoomChange(args.timelineDuration, zoom, id, patch));
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
    edge: 'start' | 'end' | 'move'
  ) => args.setZoom((zoom) => applyZoomCommit(args.timelineDuration, zoom, id, range, edge));
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
      const created = { ...region, id: `zoom-${crypto.randomUUID()}` };
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
