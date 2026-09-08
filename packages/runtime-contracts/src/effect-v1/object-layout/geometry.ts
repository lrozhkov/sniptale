import type { EffectV1ObjectLayout } from '../model/types.js';

export const EFFECT_V1_OBJECT_MAX_SIZE = 16384;

/** A stable object box, independent of animation time and raster resolution. */
export function resolveEffectV1ObjectLayout(
  layout: EffectV1ObjectLayout,
  available: { width: number; height: number } = layout
): { width: number; height: number } {
  for (const value of [layout.width, layout.height, available.width, available.height]) {
    if (!Number.isFinite(value) || value < 1 || value > EFFECT_V1_OBJECT_MAX_SIZE) {
      throw new Error('Object layout dimensions must be between 1 and 16384.');
    }
  }
  if (layout.resize === 'reflow') {
    return { width: available.width, height: available.height };
  }
  if (layout.resize !== 'scale') throw new Error('Unknown object resize policy.');
  const scale = Math.min(available.width / layout.width, available.height / layout.height);
  return { width: layout.width * scale, height: layout.height * scale };
}

export const EFFECT_V1_HANDLE_MAX_COORDINATE = 1_000_000;

/** The selection remains [0, 0, layout.width, layout.height]. Only raster bounds grow. */
export function resolveEffectV1ObjectRenderBounds(
  layout: EffectV1ObjectLayout,
  controls: Readonly<Record<string, unknown>>
): { x: number; y: number; width: number; height: number } {
  resolveEffectV1ObjectLayout(layout);
  let x = 0,
    y = 0,
    right = layout.width,
    bottom = layout.height;
  for (const handle of layout.handles ?? []) {
    const px = controls[handle.xControl],
      py = controls[handle.yControl];
    if (
      typeof px !== 'number' ||
      typeof py !== 'number' ||
      !Number.isFinite(px) ||
      !Number.isFinite(py) ||
      Math.abs(px) > EFFECT_V1_HANDLE_MAX_COORDINATE ||
      Math.abs(py) > EFFECT_V1_HANDLE_MAX_COORDINATE
    ) {
      throw new Error('Object handle coordinates must be finite numbers.');
    }
    if (!Number.isFinite(handle.padding) || handle.padding < 0 || handle.padding > 256) {
      throw new Error('Object handle padding must be between 0 and 256.');
    }
    x = Math.min(x, px - handle.padding);
    y = Math.min(y, py - handle.padding);
    right = Math.max(right, px + handle.padding);
    bottom = Math.max(bottom, py + handle.padding);
  }
  return { x, y, width: right - x, height: bottom - y };
}

/** Convert a scene-space pointer to graph controls. Placement uses a top-left box rotated about its centre. */
export function mapEffectV1ScenePoint(
  layout: EffectV1ObjectLayout,
  placement: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  },
  point: { x: number; y: number }
): { x: number; y: number } {
  resolveEffectV1ObjectLayout(layout, placement);
  if (![placement.x, placement.y, placement.rotation, point.x, point.y].every(Number.isFinite)) {
    throw new Error('Object placement and scene point must be finite.');
  }
  const dx = point.x - placement.x - placement.width / 2;
  const dy = point.y - placement.y - placement.height / 2;
  const cos = Math.cos(placement.rotation),
    sin = Math.sin(placement.rotation);
  return {
    x: ((dx * cos + dy * sin + placement.width / 2) * layout.width) / placement.width,
    y: ((-dx * sin + dy * cos + placement.height / 2) * layout.height) / placement.height,
  };
}

/** Convert a document handle's local default to a persisted scene-space anchor. */
export function mapEffectV1ObjectPoint(
  layout: EffectV1ObjectLayout,
  placement: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  },
  point: { x: number; y: number }
): { x: number; y: number } {
  mapEffectV1ScenePoint(layout, placement, point);
  const dx = (point.x * placement.width) / layout.width - placement.width / 2;
  const dy = (point.y * placement.height) / layout.height - placement.height / 2;
  const cos = Math.cos(placement.rotation),
    sin = Math.sin(placement.rotation);
  return {
    x: placement.x + placement.width / 2 + dx * cos - dy * sin,
    y: placement.y + placement.height / 2 + dx * sin + dy * cos,
  };
}
