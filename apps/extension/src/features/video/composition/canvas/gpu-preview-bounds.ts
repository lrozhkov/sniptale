import { gpuPreviewFilterSupport } from './gpu-preview-filter';
import { getCanvasPointsBounds } from '@sniptale/runtime-contracts/canvas-interactions';
import { rectCorners } from '../motion/math';
import {
  unionQuickEditRects,
  invertQuickEditProjection,
  projectQuickEditPoint,
} from '../motion/spatial-geometry';
import type { GpuPreviewGroup, GpuPreviewLayer } from './gpu-preview-types';

type Size = { width: number; height: number };
type Rect = Size & { x: number; y: number };
const full = (size: Size): Rect => ({ x: 0, y: 0, ...size });

function union(rects: readonly Rect[]): Rect {
  if (!rects.length) return { x: 0, y: 0, width: 0, height: 0 };
  return unionQuickEditRects(rects);
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

const FLOAT_EPSILON = 2 ** -23;

function filteredSupport(layer: GpuPreviewLayer, output: Size, logical: Size, source: Size) {
  if (
    ![source.width, source.height].every((value) => Number.isSafeInteger(value) && value > 0) ||
    ![
      layer.rect.width,
      layer.rect.height,
      output.width,
      output.height,
      logical.width,
      logical.height,
    ].every((value) => Number.isFinite(value) && value > 0)
  )
    return null;
  const m = layer.inverse.map(Math.fround);
  const width = Math.fround(logical.width),
    height = Math.fround(logical.height);
  const dx = width / output.width,
    dy = height / output.height;
  const scaleX = source.width / Math.fround(layer.rect.width);
  const scaleY = source.height / Math.fround(layer.rect.height);
  let denominator = Infinity;
  const magnitude = [0, 0, 0],
    errors = [0, 0, 0];
  for (const x of [0, width + dx])
    for (const y of [0, height + dy]) {
      for (let row = 0; row < 3; row++) {
        const a = m[row * 3]!,
          b = m[row * 3 + 1]!,
          c = m[row * 3 + 2]!;
        const value = a * x + b * y + c;
        magnitude[row] = Math.max(magnitude[row]!, Math.abs(value));
        // Covers Float32 coordinate scaling, dot products, and division before subtraction.
        errors[row] = Math.max(
          errors[row]!,
          32 * FLOAT_EPSILON * (Math.abs(a * x) + Math.abs(b * y) + Math.abs(c))
        );
        if (row === 2) denominator = Math.min(denominator, value);
      }
    }
  denominator -= errors[2]!;
  if (!(denominator > 1e-6)) return null;
  const coordinateError = (row: number) => {
    const bound = (magnitude[row]! + errors[row]!) / denominator;
    return (errors[row]! + bound * errors[2]!) / denominator + 8 * FLOAT_EPSILON * bound;
  };
  const error = 2 * Math.hypot(coordinateError(0) * scaleX, coordinateError(1) * scaleY);
  let horizontal = 0,
    vertical = 0;
  for (const x of [0, width])
    for (const y of [0, height]) {
      // Finite differences of a homography: the changed-axis terms cancel exactly.
      const hx = (m[0]! * m[8]! - m[2]! * m[6]! + (m[0]! * m[7]! - m[1]! * m[6]!) * y) * dx;
      const hy = (m[3]! * m[8]! - m[5]! * m[6]! + (m[3]! * m[7]! - m[4]! * m[6]!) * y) * dx;
      const vx = (m[1]! * m[8]! - m[2]! * m[7]! + (m[1]! * m[6]! - m[0]! * m[7]!) * x) * dy;
      const vy = (m[4]! * m[8]! - m[5]! * m[7]! + (m[4]! * m[6]! - m[3]! * m[7]!) * x) * dy;
      horizontal = Math.max(horizontal, Math.hypot(hx * scaleX, hy * scaleY));
      vertical = Math.max(vertical, Math.hypot(vx * scaleX, vy * scaleY));
    }
  const footprint = Math.max(horizontal, vertical) / (denominator * denominator) + error;
  // layerValues supplies these weights directly; an enabled flag is not a shader uniform.
  const focus =
    layer.depth?.frame.focus
      .slice(0, 2)
      .reduce(
        (sum, item) => sum + Math.max(0, Math.fround(item.settings.strength * item.weight)),
        0
      ) ?? 0;
  const radius =
    Math.max(Math.fround(layer.blur ?? 0), (focus * 24 * width) / 1920) * Math.max(scaleX, scaleY);
  const maximum = Math.max(footprint, radius) * (1 + 32 * FLOAT_EPSILON);
  if (!Number.isFinite(maximum)) return null;
  return gpuPreviewFilterSupport(source, Math.log2(Math.max(1, maximum)));
}

/** One encode owns conservative draw bounds; masks and unsafe projections retain full coverage. */
export function createGpuPreviewDrawBounds() {
  const groups = new WeakMap<GpuPreviewGroup, Rect>();
  const unknownFilters = new WeakMap<GpuPreviewGroup, boolean>();
  const hasUnknownFilter = (group: GpuPreviewGroup): boolean => {
    let value = unknownFilters.get(group);
    if (value === undefined) {
      value = group.layers.some(
        (child) =>
          !!child.imageFilters ||
          ('kind' in child.source &&
            child.source.kind === 'group' &&
            hasUnknownFilter(child.source))
      );
      unknownFilters.set(group, value);
    }
    return value;
  };
  const bounds = (layer: GpuPreviewLayer, logical: Size, output: Size): Rect => {
    // Destination-in must also clear destination pixels outside the source footprint.
    if (layer.blend === 'mask' || layer.lens || layer.cssFilter) return full(logical);
    const filtered = !!layer.depth || (layer.blur ?? 0) > 0;
    const group = 'kind' in layer.source && layer.source.kind === 'group' ? layer.source : null;
    const support =
      filtered && group && !layer.imageFilters && !hasUnknownFilter(group)
        ? filteredSupport(layer, output, logical, group.output)
        : null;
    if (filtered && !support) return full(logical);
    let rect = layer.rect;
    if (group) {
      if (layer.orientation && (layer.orientation.rotation !== 0 || layer.orientation.flip))
        return full(logical);
      let content = groups.get(group);
      if (!content) {
        // These operations can remove or recolor destination pixels but cannot create alpha.
        content = group.composition
          ? full(group.logical)
          : union(
              group.layers
                .filter(
                  (child) =>
                    child.blend !== 'mask' && child.blend !== 'erase' && child.blend !== 'atop'
                )
                .map((child) => bounds(child, group.logical, group.output))
            );
        groups.set(group, content);
      }
      if (content.width === 0 || content.height === 0) return { x: 0, y: 0, width: 0, height: 0 };
      if (support) {
        const dx = (support.x * group.logical.width) / group.output.width;
        const dy = (support.y * group.logical.height) / group.output.height;
        const x = Math.max(0, content.x - dx),
          y = Math.max(0, content.y - dy);
        content = {
          x,
          y,
          width: Math.max(0, Math.min(group.logical.width, content.x + content.width + dx) - x),
          height: Math.max(0, Math.min(group.logical.height, content.y + content.height + dy) - y),
        };
      }
      rect = {
        x: rect.x + (content.x * rect.width) / group.logical.width,
        y: rect.y + (content.y * rect.height) / group.logical.height,
        width: (content.width * rect.width) / group.logical.width,
        height: (content.height * rect.height) / group.logical.height,
      };
    }
    const forward = invertQuickEditProjection(layer.inverse);
    if (!forward) return full(logical);
    if (
      filtered &&
      rectCorners(rect).some(
        (point) => forward[6] * point.x + forward[7] * point.y + forward[8] <= 1e-6
      )
    )
      return full(logical);
    const corners = rectCorners(rect).map((point) => projectQuickEditPoint(forward, point));
    if (corners.some((point) => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)))
      return full(logical);
    const points = corners.map((point) => point!);
    return padded(getCanvasPointsBounds(points), logical, output);
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
