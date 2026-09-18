import { useState } from 'react';
import type {
  QuickEditAdvancedState,
  QuickEditBackgroundSettings,
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

/** One zoom-editing workflow owner: region selection, updates, and the stage focus overlay. */
export function useReviewZoomEditor(args: {
  setZoom(update: (zoom: ZoomState) => ZoomState): void;
  background: QuickEditBackgroundSettings;
  zoom: ZoomState;
  timelineDuration: number;
}) {
  const [selection, setSelection] = useState<string | null>(null);
  const add = (at: number, timelineDuration: number) => {
    const range = availableQuickEditZoomRange({
      regions: args.zoom.regions,
      at,
      timelineDuration,
    });
    if (!range) {
      // Occupied playhead: point the editor at the existing region instead of
      // inserting an overlapping one; EOF refuses silently.
      const existing = args.zoom.regions.find((region) => at >= region.start && at < region.end);
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
    setSelection((current) => (current === id ? null : current));
  };
  const resetPosition = (id: string) =>
    args.setZoom((zoom) => ({
      ...zoom,
      regions: updateQuickEditZoomRegion(zoom.regions, id, { centerX: 0.5, centerY: 0.5 }),
    }));
  const change = (id: string, patch: QuickEditZoomRegionPatch) =>
    args.setZoom((zoom) => {
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
            timelineDuration: args.timelineDuration,
          });
          return { ...region, start: range.start };
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
            timelineDuration: args.timelineDuration,
          });
          return { ...region, end: range.end };
        });
      }
      const { start: _startPatch, end: _endPatch, ...rest } = patch;
      return { ...zoom, regions: updateQuickEditZoomRegion(regions, id, rest) };
    });
  const commitDrag = (
    id: string,
    range: { start: number; end: number },
    edge: 'start' | 'end' | 'move'
  ) =>
    args.setZoom((zoom) => ({
      ...zoom,
      regions: zoom.regions.map((region) => {
        if (region.id !== id) return region;
        if (edge === 'move')
          return {
            ...region,
            ...moveQuickEditZoomRegion({
              regions: zoom.regions,
              id,
              requestedStart: range.start,
              timelineDuration: args.timelineDuration,
            }),
          };
        const trimmed = trimQuickEditZoomRegion({
          regions: zoom.regions,
          id,
          edge,
          time: edge === 'start' ? range.start : range.end,
          timelineDuration: args.timelineDuration,
        });
        return { ...region, start: trimmed.start, end: trimmed.end };
      }),
    }));
  const selected = (zoom: ZoomState): QuickEditZoomRegion | null =>
    zoom.regions.find((item) => item.id === selection) ?? null;
  const focusOverlay = (region: QuickEditZoomRegion) => ({
    camera: region.transform,
    background: args.background,
    onDrag: (point: { x: number; y: number }) =>
      change(region.id, { centerX: point.x, centerY: point.y }),
  });
  return {
    selection,
    setSelection,
    add,
    remove,
    resetPosition,
    change,
    commitDrag,
    selected,
    focusOverlay,
  };
}
