import { acquireVideoCompositionBuffer } from '../../composition/canvas/buffer-pool';
import type { VideoSceneBackgroundMotion } from '../types/layout';
import { evaluateSceneBackgroundMotion } from './background-motion';

type Lease = NonNullable<ReturnType<typeof acquireVideoCompositionBuffer>>;
interface MotionRaster {
  key: string;
  image: CanvasImageSource | null;
  lease: Lease;
  timer: ReturnType<typeof setTimeout>;
}
const rasters = new WeakMap<CanvasRenderingContext2D, MotionRaster>();

/** Report the retained paint to the preview allocation owner. */
export function getSceneBackgroundMotionRasterSize(context: CanvasRenderingContext2D) {
  const raster = rasters.get(context);
  return raster ? { width: raster.lease.canvas.width, height: raster.lease.canvas.height } : null;
}

/** Release only the disposable paint raster; authored settings and source assets remain intact. */
export function releaseSceneBackgroundMotionRaster(context: CanvasRenderingContext2D) {
  const previous = rasters.get(context);
  if (!previous) return;
  clearTimeout(previous.timer);
  previous.lease.release();
  rasters.delete(context);
}

interface BackgroundMotionDrawArgs {
  context: CanvasRenderingContext2D;
  cacheOwner?: CanvasRenderingContext2D;
  motion: VideoSceneBackgroundMotion;
  currentTime: number;
  width: number;
  height: number;
  paintKey: string;
  image: CanvasImageSource | null;
  animatedPaint?: boolean;
  acquire?: (width: number, height: number) => Lease | null;
  paint(context: CanvasRenderingContext2D, width: number, height: number): void;
}

/** Acquire and retain only fully painted source rasters; failed leases never enter the cache. */
function prepareMotionRaster(args: BackgroundMotionDrawArgs) {
  const { context, width, height } = args;
  if (!(width > 0 && height > 0)) throw new Error('Invalid background motion dimensions.');
  const owner = args.cacheOwner ?? context;
  const scale = Math.min(1, 2048 / Math.max(width, height));
  const rw = Math.max(1, Math.round(width * scale));
  const rh = Math.max(1, Math.round(height * scale));
  const key = JSON.stringify([args.paintKey, rw, rh]);
  let raster = rasters.get(owner);
  if (!raster || raster.key !== key || raster.image !== args.image || args.animatedPaint) {
    releaseSceneBackgroundMotionRaster(owner);
    const lease = args.acquire
      ? args.acquire(rw, rh)
      : acquireVideoCompositionBuffer(rw, rh, context.canvas?.ownerDocument);
    const target = lease?.canvas.getContext('2d');
    if (!lease || !target || !('drawImage' in target)) {
      lease?.release();
      throw new Error('Background motion compositor is unavailable.');
    }
    try {
      target.setTransform(1, 0, 0, 1, 0, 0);
      target.globalAlpha = 1;
      target.globalCompositeOperation = 'source-over';
      target.clearRect(0, 0, rw, rh);
      args.paint(target as CanvasRenderingContext2D, rw, rh);
    } catch (error) {
      lease.release();
      throw error;
    }
    raster = {
      key,
      image: args.image,
      lease,
      timer: setTimeout(() => releaseSceneBackgroundMotionRaster(owner), 1000),
    };
    rasters.set(owner, raster);
  }
  clearTimeout(raster.timer);
  raster.timer = setTimeout(() => releaseSceneBackgroundMotionRaster(owner), 1000);
  return { source: raster.lease.canvas, rw, rh };
}

/** Cache the source paint and move it with bounded Canvas draws, before foreground composition. */
export function drawSceneBackgroundMotion(args: BackgroundMotionDrawArgs) {
  const { context, width, height, motion } = args;
  const { source, rw, rh } = prepareMotionRaster(args);
  const frame = evaluateSceneBackgroundMotion(motion, args.currentTime);
  context.save();
  try {
    context.beginPath();
    context.rect(0, 0, width, height);
    context.clip();
    if (motion.mode === 'waves') {
      // Fixed strip count bounds CPU work independently of output resolution. Overscan protects edges.
      const strips = 96;
      const zoom = 1 + 0.08 * frame.amount;
      const dw = width * zoom;
      const dh = height * zoom;
      for (let i = 0; i < strips; i++) {
        const v = (i + 0.5) / strips;
        const wave = Math.sin(
          Math.PI *
            2 *
            (3 * v + 0.04 * Math.sin(Math.PI * 2 * (v * 1.5 + frame.time / 10)) - frame.time / 6)
        );
        const shift = wave * width * 0.012 * frame.amount;
        context.drawImage(
          source,
          0,
          (i * rh) / strips,
          rw,
          rh / strips,
          (width - dw) / 2 + shift,
          (height - dh) / 2 + (i * dh) / strips,
          dw,
          dh / strips + 1
        );
      }
    } else {
      const zoom = frame.zoom;
      context.drawImage(
        source,
        (width - width * zoom) / 2 + frame.offsetX * width,
        (height - height * zoom) / 2 + frame.offsetY * height,
        width * zoom,
        height * zoom
      );
      if (motion.mode === 'glow') {
        const radius = Math.min(width, height) * 0.75;
        frame.lights.forEach((light, index) => {
          const x = light.x * width;
          const y = light.y * height;
          const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
          const alpha = (index === 1 ? 0.3 : 0.24) * frame.amount;
          const color = index === 1 ? '0, 0, 0' : '255, 255, 255';
          gradient.addColorStop(0, `rgba(${color}, ${alpha})`);
          gradient.addColorStop(1, `rgba(${color}, 0)`);
          context.fillStyle = gradient;
          context.fillRect(0, 0, width, height);
        });
      }
    }
  } finally {
    context.restore();
  }
}
