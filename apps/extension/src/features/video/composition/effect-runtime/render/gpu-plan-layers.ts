import { getCanvasPointsBounds } from '@sniptale/runtime-contracts/canvas-interactions';
import { unionQuickEditRects } from '../../motion/spatial-geometry';
import type {
  EffectRuntimeGpuDraw,
  EffectRuntimeGpuOperation,
  EffectRuntimeGpuRect,
  EffectRuntimeGpuSource,
  EffectRuntimeGpuTransform,
} from '../../../../../contracts/effect-runtime/gpu-plan';
import type { GpuPreviewGroup, GpuPreviewLayer } from '../../canvas/gpu-preview';
import type { QuickEditHomography } from '../../motion/spatial-geometry';
import {
  EFFECT_RUNTIME_RESOURCE_LIMITS,
  EffectRuntimeResourceError,
} from '../runtime/resource-limits';

type Size = { width: number; height: number };
interface EffectRuntimeGpuLayerSource extends Size {
  source: GpuPreviewLayer['source'];
}
const IDENTITY: QuickEditHomography = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const BLENDS = {
  'source-over': 'over',
  lighter: 'add',
  screen: 'screen',
  'source-atop': 'atop',
  'destination-in': 'mask',
} as const;

/** Adapt one evaluated operation. Every source stays borrowed through the caller's GPU fence. */
export function buildEffectRuntimeGpuOperationLayers(
  operation: EffectRuntimeGpuOperation,
  output: Size,
  resolveSource: (source: EffectRuntimeGpuSource) => EffectRuntimeGpuLayerSource,
  resolveCoverage: (resourceId: number) => ImageBitmap
): { clear: boolean; layers: readonly GpuPreviewLayer[] } {
  if (operation.op === 'clear') {
    if (operation.coverage === undefined) return { clear: true, layers: [] };
    return {
      clear: false,
      layers: [
        {
          source: coverage(operation.coverage),
          rect: { x: 0, y: 0, ...output },
          inverse: IDENTITY,
          blend: 'erase',
        },
      ],
    };
  }
  const source = resolveSource(operation.source);
  const raw = sourceLayer(operation, source);
  if (!raw) return { clear: false, layers: [] };
  const clip =
    operation.coverage === undefined ? undefined : { source: coverage(operation.coverage) };
  const blend = BLENDS[operation.blend];
  const paint = (layer: GpuPreviewLayer): GpuPreviewLayer => ({
    ...layer,
    blend,
    ...(clip ? { operationClip: clip } : {}),
  });
  const filter = operation.filter;
  const shadow = operation.shadow;
  const shadowVisible = shadow.color[3] > 0 && operation.alpha > 0;
  const filtered = filter.blur > 0 || filter.brightness !== 1 || filter.saturate !== 1;
  if (!filtered && !shadowVisible) return { clear: false, layers: [paint(raw.layer)] };

  // Six sigmas leaves less than one 8-bit channel of Gaussian tail outside the retained raster.
  const filterPadding = padding(filter.blur);
  const shadowSigma = shadow.blur / 2;
  const shadowPadding = shadowVisible ? padding(shadowSigma) : 0;
  const viewport = { x: 0, y: 0, ...output };
  const interest = union(
    expand(viewport, filterPadding),
    shadowVisible
      ? expand(
          { ...viewport, x: -shadow.offsetX, y: -shadow.offsetY },
          filterPadding + shadowPadding
        )
      : viewport
  );
  const bounds = intersection(expand(raw.bounds, filterPadding), interest);
  if (!bounds)
    return { clear: false, layers: blend === 'mask' ? [paint({ ...raw.layer, opacity: 0 })] : [] };
  const image: GpuPreviewLayer = {
    source: group([raw.layer], bounds),
    rect: bounds,
    inverse: IDENTITY,
    ...(filtered ? { cssFilter: { ...filter } } : {}),
  };
  const layers: GpuPreviewLayer[] = [];
  if (shadowVisible) {
    const shadowBounds = expand(bounds, shadowPadding);
    layers.push(
      paint({
        source: group([image], shadowBounds),
        rect: {
          ...shadowBounds,
          x: shadowBounds.x + shadow.offsetX,
          y: shadowBounds.y + shadow.offsetY,
        },
        inverse: IDENTITY,
        tint: shadow.color,
        ...(shadowSigma > 0
          ? { cssFilter: { blur: shadowSigma, brightness: 1, saturate: 1 } }
          : {}),
      })
    );
  }
  layers.push(paint(image));
  return { clear: false, layers };

  function coverage(id: number): ImageBitmap {
    const bitmap = resolveCoverage(id);
    if (bitmap.width !== output.width || bitmap.height !== output.height)
      throw new Error('GPU operation coverage dimensions do not match its pass.');
    return bitmap;
  }
}

function sourceLayer(
  operation: EffectRuntimeGpuDraw,
  source: EffectRuntimeGpuLayerSource
): {
  layer: GpuPreviewLayer;
  bounds: EffectRuntimeGpuRect;
} | null {
  const crop = normalize(operation.sourceRect),
    destination = normalize(operation.destination);
  if (!crop || !destination) return null;
  const visible = intersection(crop, { x: 0, y: 0, width: source.width, height: source.height });
  if (!visible) return null;
  const sx = destination.width / crop.width,
    sy = destination.height / crop.height;
  const clipped = {
    x: destination.x + (visible.x - crop.x) * sx,
    y: destination.y + (visible.y - crop.y) * sy,
    width: visible.width * sx,
    height: visible.height * sy,
  };
  const inverse = invert(operation.transform);
  if (!inverse) return null;
  return {
    layer: {
      source: source.source,
      rect: {
        x: destination.x - crop.x * sx,
        y: destination.y - crop.y * sy,
        width: source.width * sx,
        height: source.height * sy,
      },
      inverse,
      opacity: operation.alpha,
      clip: { rect: clipped, radius: 0 },
    },
    bounds: transformedBounds(clipped, operation.transform),
  };
}

function normalize(rect: EffectRuntimeGpuRect): EffectRuntimeGpuRect | null {
  if (rect.width === 0 || rect.height === 0) return null;
  return {
    x: rect.width < 0 ? rect.x + rect.width : rect.x,
    y: rect.height < 0 ? rect.y + rect.height : rect.y,
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
}

function invert([a, b, c, d, e, f]: EffectRuntimeGpuTransform): QuickEditHomography | null {
  const determinant = a * d - b * c;
  if (determinant === 0) return null;
  const inverse: QuickEditHomography = [
    d / determinant,
    -c / determinant,
    (c * f - d * e) / determinant,
    -b / determinant,
    a / determinant,
    (b * e - a * f) / determinant,
    0,
    0,
    1,
  ];
  if (!inverse.every(Number.isFinite))
    throw new Error('GPU drawing transform cannot be represented.');
  return inverse;
}

function transformedBounds(
  rect: EffectRuntimeGpuRect,
  [a, b, c, d, e, f]: EffectRuntimeGpuTransform
) {
  const points = [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x, rect.y + rect.height],
    [rect.x + rect.width, rect.y + rect.height],
  ];
  return getCanvasPointsBounds(
    points.map(([x, y]) => ({
      x: a * x! + c * y! + e,
      y: b * x! + d * y! + f,
    }))
  );
}

function intersection(
  a: EffectRuntimeGpuRect,
  b: EffectRuntimeGpuRect
): EffectRuntimeGpuRect | null {
  const x = Math.max(a.x, b.x),
    y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}
function union(a: EffectRuntimeGpuRect, b: EffectRuntimeGpuRect): EffectRuntimeGpuRect {
  return unionQuickEditRects([a, b]);
}
function padding(sigma: number) {
  return sigma > 0 ? Math.ceil(sigma * 6) + 2 : 0;
}
function expand(rect: EffectRuntimeGpuRect, amount: number): EffectRuntimeGpuRect {
  const x = Math.floor(rect.x - amount),
    y = Math.floor(rect.y - amount);
  return {
    x,
    y,
    width: Math.ceil(rect.x + rect.width + amount) - x,
    height: Math.ceil(rect.y + rect.height + amount) - y,
  };
}

function group(layers: readonly GpuPreviewLayer[], bounds: EffectRuntimeGpuRect): GpuPreviewGroup {
  if (
    ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isSafeInteger) ||
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    bounds.width * bounds.height * 4 > EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedRasterBytes
  )
    throw new EffectRuntimeResourceError();
  return {
    kind: 'group',
    output: { width: bounds.width, height: bounds.height },
    logical: { width: bounds.width, height: bounds.height },
    layers: layers.map((layer) => ({
      ...layer,
      inverse: translateInverse(layer.inverse, bounds.x, bounds.y),
    })),
  };
}
function translateInverse(m: QuickEditHomography, x: number, y: number): QuickEditHomography {
  return [
    m[0],
    m[1],
    m[0] * x + m[1] * y + m[2],
    m[3],
    m[4],
    m[3] * x + m[4] * y + m[5],
    m[6],
    m[7],
    m[6] * x + m[7] * y + m[8],
  ];
}
