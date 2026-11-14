import type { FabricImage, FabricObject } from 'fabric';
import type { EditorFrameSettings } from '../../features/editor/document/types';
import { getBackgroundImageLayout } from '../controller/background/geometry';
import { wrapRasterSourcePoint } from './selection';
import {
  assertRasterSize,
  assertSourcePoint,
  type PixelBounds,
  type RasterAffine,
  type RasterSize,
  type RasterSourceGeometry,
  type SourcePoint,
} from './contracts';

function transform(matrix: RasterAffine, point: SourcePoint): SourcePoint {
  assertSourcePoint(point);
  const [a, b, c, d, e, f] = matrix;
  return { x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f };
}

/** Map full source pixels through the object's crop-centered transform, including its groups. */
export function createNativeRasterGeometry(
  image: Pick<FabricImage, 'width' | 'height' | 'cropX' | 'cropY' | 'calcTransformMatrix'>,
  source: RasterSize,
  crop: PixelBounds = { x: image.cropX, y: image.cropY, width: image.width, height: image.height }
): RasterSourceGeometry {
  assertRasterSize(source);
  const [a, b, c, d, e, f] = image.calcTransformMatrix();
  const x = -image.cropX - image.width / 2;
  const y = -image.cropY - image.height / 2;
  return {
    ...source,
    crop: { ...crop },
    sourceToScene: [a, b, c, d, e + a * x + c * y, f + b * x + d * y],
    periodic: false,
  };
}

/** Reuse the render owner's fit at its actual pre-blur raster size. */
export function createBackgroundRasterGeometry(options: {
  source: RasterSize;
  document: PixelBounds;
  fit: EditorFrameSettings['backgroundImageFit'];
  renderSize?: RasterSize;
  crop?: PixelBounds;
  nativeObject?: Pick<FabricObject, 'width' | 'height' | 'calcTransformMatrix'>;
  flipX?: boolean;
  flipY?: boolean;
}): RasterSourceGeometry {
  const { source, document, fit } = options;
  assertRasterSize(source);
  const crop = options.crop ?? { x: 0, y: 0, width: source.width, height: source.height };
  const raster = options.renderSize ?? document;
  const sx = document.width / raster.width;
  const sy = document.height / raster.height;
  const layout =
    fit === 'tile'
      ? { left: 0, top: 0, scaleX: 1, scaleY: 1 }
      : getBackgroundImageLayout(fit, raster, crop);
  const scaleX = layout.scaleX * sx;
  const scaleY = layout.scaleY * sy;
  if (options.nativeObject) {
    const object = options.nativeObject;
    // Native images already carry fit in their transform. Tile/blur objects contain a render raster.
    const rasterized = fit === 'tile' || options.renderSize !== undefined;
    const localScaleX = rasterized ? layout.scaleX : 1;
    const localScaleY = rasterized ? layout.scaleY : 1;
    const left = rasterized ? layout.left : 0;
    const top = rasterized ? layout.top : 0;
    const localX = left - crop.x * localScaleX - object.width / 2;
    const localY = top - crop.y * localScaleY - object.height / 2;
    const [a, b, c, d, e, f] = object.calcTransformMatrix();
    return {
      width: source.width,
      height: source.height,
      crop: { ...crop },
      sourceToScene: [
        a * localScaleX,
        b * localScaleX,
        c * localScaleY,
        d * localScaleY,
        e + a * localX + c * localY,
        f + b * localX + d * localY,
      ],
      periodic: fit === 'tile',
      sceneClip: { ...document },
      sourceClip: {
        x: crop.x - left / localScaleX,
        y: crop.y - top / localScaleY,
        width: object.width / localScaleX,
        height: object.height / localScaleY,
      },
    };
  }
  return {
    ...source,
    crop: { ...crop },
    sourceToScene: [
      options.flipX ? -scaleX : scaleX,
      0,
      0,
      options.flipY ? -scaleY : scaleY,
      document.x +
        (options.flipX
          ? document.width - layout.left * sx + crop.x * scaleX
          : layout.left * sx - crop.x * scaleX),
      document.y +
        (options.flipY
          ? document.height - layout.top * sy + crop.y * scaleY
          : layout.top * sy - crop.y * scaleY),
    ],
    periodic: fit === 'tile',
    sceneClip: { ...document },
  };
}

/** Project continuous source coordinates. The viewport belongs to the pointer adapter. */
export function rasterSourceToScene(
  geometry: RasterSourceGeometry,
  point: SourcePoint
): SourcePoint {
  return transform(geometry.sourceToScene, point);
}

/** Invert scene geometry. Wrap only pixel queries, never a continuous tile gesture. */
export function sceneToRasterSource(
  geometry: RasterSourceGeometry,
  point: SourcePoint,
  wrapPeriodic = false
): SourcePoint {
  assertSourcePoint(point);
  const [a, b, c, d, e, f] = geometry.sourceToScene;
  const determinant = a * d - b * c;
  if (!Number.isFinite(determinant) || determinant === 0)
    throw new RangeError('Raster transform is singular');
  const x = point.x - e;
  const y = point.y - f;
  const source = { x: (d * x - c * y) / determinant, y: (a * y - b * x) / determinant };
  return geometry.periodic && wrapPeriodic ? wrapRasterSourcePoint(geometry.crop, source) : source;
}

/** Return integer source crop bounds with an optional width-to-height ratio. */
export function rasterCropBounds(
  size: RasterSize,
  start: SourcePoint,
  end: SourcePoint,
  ratio: number | null
): PixelBounds | null {
  if (start.x === end.x || start.y === end.y) return null;
  const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));
  const forwardX = end.x >= start.x,
    forwardY = end.y >= start.y;
  const anchorX = clamp(forwardX ? Math.floor(start.x) : Math.ceil(start.x), size.width);
  const anchorY = clamp(forwardY ? Math.floor(start.y) : Math.ceil(start.y), size.height);
  const edgeX = clamp(forwardX ? Math.ceil(end.x) : Math.floor(end.x), size.width);
  const edgeY = clamp(forwardY ? Math.ceil(end.y) : Math.floor(end.y), size.height);
  let width = Math.abs(edgeX - anchorX),
    height = Math.abs(edgeY - anchorY);
  if (ratio) {
    width = Math.floor(Math.min(width, height * ratio));
    height = Math.floor(width / ratio);
  }
  return width > 0 && height > 0
    ? {
        x: forwardX ? anchorX : anchorX - width,
        y: forwardY ? anchorY : anchorY - height,
        width,
        height,
      }
    : null;
}
