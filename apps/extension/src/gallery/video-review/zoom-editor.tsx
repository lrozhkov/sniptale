import { useState } from 'react';
import type {
  QuickEditAdvancedState,
  QuickEditBackgroundSettings,
  QuickEditZoomRegion,
} from '../../features/video/review/advanced/types';
import {
  createQuickEditZoomRegion,
  insertQuickEditZoomRegion,
  updateQuickEditZoomRegion,
  type QuickEditZoomRegionPatch,
} from '../../features/video/review/advanced/zoom';

type ZoomState = QuickEditAdvancedState['zoom'];

/** One zoom-editing workflow owner: region selection, updates, and the stage focus overlay. */
export function useReviewZoomEditor(args: {
  setZoom(update: (zoom: ZoomState) => ZoomState): void;
  background: QuickEditBackgroundSettings;
}) {
  const [selection, setSelection] = useState<string | null>(null);
  const add = (at: number, endMax: number) => {
    const region = createQuickEditZoomRegion({
      id: `zoom-${crypto.randomUUID()}`,
      at,
      endMax,
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
    args.setZoom((zoom) => ({
      ...zoom,
      regions: updateQuickEditZoomRegion(zoom.regions, id, patch),
    }));
  const commitDrag = (id: string, range: { start: number; end: number }) =>
    args.setZoom((zoom) => ({
      ...zoom,
      regions: zoom.regions.map((item) => (item.id === id ? { ...item, ...range } : item)),
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
