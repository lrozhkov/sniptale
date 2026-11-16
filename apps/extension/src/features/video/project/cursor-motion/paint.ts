import shapes from './apple-shapes.json';
import { evaluateCursorMotion, type CursorMotion, type CursorMotionShape } from './index';

type Raster = { canvas: HTMLCanvasElement | OffscreenCanvas; hotspot: readonly number[] };
const cache = new Map<string, Raster>();
/** Apple Cursor SVG paths (GPL-3.0): prepare artwork only when appearance changes. */
export function appleCursorRaster(
  style: Pick<CursorMotion, 'shape' | 'color' | 'outline' | 'shadow'>
): Raster {
  const key = JSON.stringify(style);
  const old = cache.get(key);
  if (old) return old;
  const canvas =
    typeof document === 'undefined'
      ? new OffscreenCanvas(256, 256)
      : document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!context) throw new Error('Cursor artwork context unavailable');
  const shape = shapes[style.shape];
  if (style.shadow) {
    context.shadowColor = 'rgba(0,0,0,.28)';
    context.shadowBlur = 12;
    context.shadowOffsetY = 5;
  }
  for (const p of shape.paths) {
    const path = new Path2D(p.d);
    const attr = p as Record<string, string>;
    context.globalAlpha = Number(attr['opacity'] ?? attr['fill-opacity'] ?? 1);
    if (attr['fill'] && attr['fill'] !== 'none') {
      context.fillStyle = style.color;
      context.fill(path, attr['fill-rule'] === 'evenodd' ? 'evenodd' : 'nonzero');
    }
    if (attr['stroke'] && attr['stroke'] !== 'none') {
      context.strokeStyle = attr['stroke'] === '#00FF00' ? style.color : style.outline;
      context.lineWidth = Number(attr['stroke-width'] ?? 1);
      context.lineCap = (attr['stroke-linecap'] ?? 'butt') as CanvasLineCap;
      context.lineJoin = (attr['stroke-linejoin'] ?? 'miter') as CanvasLineJoin;
      context.stroke(path);
    }
  }
  const raster = { canvas, hotspot: shape.hotspot };
  cache.set(key, raster);
  if (cache.size > 48) cache.delete(cache.keys().next().value!);
  return raster;
}
export function appleCursorDataUrl(
  shape: CursorMotionShape,
  color: string,
  outline: string,
  shadow: boolean
) {
  const raster = appleCursorRaster({ shape, color, outline, shadow });
  return 'toDataURL' in raster.canvas ? raster.canvas.toDataURL('image/png') : '';
}

export function cursorMotionArtwork(
  motions: readonly CursorMotion[] | undefined,
  time: number,
  video: { x: number; y: number; width: number; height: number },
  sourceHeight: number,
  resultTime = time
) {
  const evaluated = evaluateCursorMotion(motions, time, resultTime);
  if (!evaluated) return null;
  const { motion, x, y } = evaluated;
  const raster = appleCursorRaster({
    shape: motion.shape,
    color: motion.color,
    outline: motion.outline,
    shadow: motion.shadow,
  });
  const size = (motion.size * video.height) / sourceHeight;
  return {
    ...raster,
    rect: {
      x: video.x + x * video.width - (raster.hotspot[0]! / 256) * size,
      y: video.y + y * video.height - (raster.hotspot[1]! / 256) * size,
      width: size,
      height: size,
    },
  };
}
