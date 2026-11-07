import { invertQuickEditProjection, projectQuickEditPoint } from '../motion/spatial-geometry';
import type { GpuPreviewGroup, GpuPreviewLayer } from './gpu-preview-types';

type Size = { width: number; height: number };
type Rect = Size & { x: number; y: number };
const full = (size: Size): Rect => ({ x: 0, y: 0, ...size });

function union(rects: readonly Rect[]): Rect {
  if (!rects.length) return { x: 0, y: 0, width: 0, height: 0 };
  const x = Math.min(...rects.map((rect) => rect.x));
  const y = Math.min(...rects.map((rect) => rect.y));
  return {
    x,
    y,
    width: Math.max(...rects.map((rect) => rect.x + rect.width)) - x,
    height: Math.max(...rects.map((rect) => rect.y + rect.height)) - y,
  };
}

function padded(rect: Rect, logical: Size, output: Size): Rect {
  const dx = (2 * logical.width) / output.width;
  const dy = (2 * logical.height) / output.height;
  const x = Math.max(0, rect.x - dx);
  const y = Math.max(0, rect.y - dy);
  return {
    x,
    y,
    width: Math.max(0, Math.min(logical.width, rect.x + rect.width + dx) - x),
    height: Math.max(0, Math.min(logical.height, rect.y + rect.height + dy) - y),
  };
}

/** One encode owns conservative draw bounds; masks and unsafe projections retain full coverage. */
export function createGpuPreviewDrawBounds() {
  const groups = new WeakMap<GpuPreviewGroup, Rect>();
  const bounds = (layer: GpuPreviewLayer, logical: Size, output: Size): Rect => {
    // Destination-in must also clear destination pixels outside the source footprint.
    if (layer.blend === 'mask' || layer.lens || layer.depth || layer.blur || layer.cssFilter)
      return full(logical);
    let rect = layer.rect;
    if ('kind' in layer.source && layer.source.kind === 'group') {
      if (layer.orientation && (layer.orientation.rotation !== 0 || layer.orientation.flip))
        return full(logical);
      const group = layer.source;
      let content = groups.get(group);
      if (!content) {
        // These operations can remove or recolor destination pixels but cannot create alpha.
        content = union(
          group.layers
            .filter(
              (child) => child.blend !== 'mask' && child.blend !== 'erase' && child.blend !== 'atop'
            )
            .map((child) => bounds(child, group.logical, group.output))
        );
        groups.set(group, content);
      }
      if (content.width === 0 || content.height === 0) return { x: 0, y: 0, width: 0, height: 0 };
      rect = {
        x: rect.x + (content.x * rect.width) / group.logical.width,
        y: rect.y + (content.y * rect.height) / group.logical.height,
        width: (content.width * rect.width) / group.logical.width,
        height: (content.height * rect.height) / group.logical.height,
      };
    }
    const forward = invertQuickEditProjection(layer.inverse);
    if (!forward) return full(logical);
    const corners = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x, y: rect.y + rect.height },
      { x: rect.x + rect.width, y: rect.y + rect.height },
    ].map((point) => projectQuickEditPoint(forward, point));
    if (corners.some((point) => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)))
      return full(logical);
    const points = corners.map((point) => point!);
    const x = Math.min(...points.map((point) => point.x));
    const y = Math.min(...points.map((point) => point.y));
    return padded(
      {
        x,
        y,
        width: Math.max(...points.map((point) => point.x)) - x,
        height: Math.max(...points.map((point) => point.y)) - y,
      },
      logical,
      output
    );
  };
  return (
    layer: GpuPreviewLayer,
    output: Size,
    logical: Size,
    destination?: readonly [number, number, number, number]
  ): [number, number, number, number] => {
    // A cleared pass has no destination outside the conservative prior paint bounds.
    if (layer.blend === 'mask' && destination) return [...destination];
    const rect = bounds(layer, logical, output);
    const x = Math.min(
      output.width,
      Math.max(0, Math.floor((rect.x * output.width) / logical.width))
    );
    const y = Math.min(
      output.height,
      Math.max(0, Math.floor((rect.y * output.height) / logical.height))
    );
    const right = Math.min(
      output.width,
      Math.ceil(((rect.x + rect.width) * output.width) / logical.width)
    );
    const bottom = Math.min(
      output.height,
      Math.ceil(((rect.y + rect.height) * output.height) / logical.height)
    );
    return [x, y, Math.max(0, right - x), Math.max(0, bottom - y)];
  };
}
