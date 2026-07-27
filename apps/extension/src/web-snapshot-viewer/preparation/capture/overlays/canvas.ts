import type { FrameData } from '../../../../features/highlighter/contracts';
import {
  resolveFrameSurface,
  type FrameSurfaceComposition,
  type FrameSurfaceGeometry,
} from '../../../../features/highlighter/frame-surface';
import type { ViewerCaptureMode } from '../types';

export interface ViewerFrameProjection {
  frame: FrameData;
  surface: Omit<FrameSurfaceComposition, 'geometry'> & {
    geometry: FrameSurfaceGeometry;
  };
}

export function projectViewerFrames(args: {
  frames: FrameData[];
  iframe: HTMLIFrameElement;
  mode: ViewerCaptureMode;
}): ViewerFrameProjection[] {
  const iframeRect = args.iframe.getBoundingClientRect();
  const scrollX = args.mode === 'full' ? (args.iframe.contentWindow?.scrollX ?? 0) : 0;
  const scrollY = args.mode === 'full' ? (args.iframe.contentWindow?.scrollY ?? 0) : 0;

  return args.frames.map((frame) => {
    const surface = resolveFrameSurface(frame);
    return {
      frame,
      surface: {
        ...surface,
        geometry: {
          ...surface.geometry,
          x: surface.geometry.x - iframeRect.left + scrollX,
          y: surface.geometry.y - iframeRect.top + scrollY,
        },
      },
    };
  });
}

export function traceRoundedRect(
  context: CanvasRenderingContext2D,
  geometry: Pick<FrameSurfaceGeometry, 'x' | 'y' | 'width' | 'height' | 'radius'>
): void {
  context.roundRect(
    geometry.x,
    geometry.y,
    Math.max(0, geometry.width),
    Math.max(0, geometry.height),
    Math.max(0, geometry.radius)
  );
}

export function clipRoundedRect(
  context: CanvasRenderingContext2D,
  geometry: FrameSurfaceGeometry
): void {
  context.beginPath();
  traceRoundedRect(context, geometry);
  context.clip();
}

export function createScratchCanvas(width: number, height: number): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas.getContext('2d') ? canvas : null;
}

export function cloneCanvasBitmap(source: HTMLCanvasElement): HTMLCanvasElement | null {
  const copy = createScratchCanvas(source.width, source.height);
  copy?.getContext('2d')?.drawImage(source, 0, 0);
  return copy;
}
