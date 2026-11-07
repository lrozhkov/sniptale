import type { CameraSpatialFrame, CameraSpatialRect } from '../../project/motion/spatial';
import type { QuickEditHomography } from '../motion/spatial-geometry';

type Size = { width: number; height: number };
type Raster = HTMLCanvasElement | OffscreenCanvas | ImageBitmap;
type Request = Parameters<GpuPreviewRenderer['render']>[0];

/** A retained scene description becomes a GPU render target, never a CPU-composited screenshot. */
export interface GpuPreviewGroup {
  kind: 'group';
  output: Size;
  logical: Size;
  layers: readonly GpuPreviewLayer[];
}

/** A layer borrows its source through completion; inverse maps output logical points to its plane. */
export interface GpuPreviewLayer {
  source: Raster | VideoFrame | GpuPreviewGroup;
  rect: CameraSpatialRect;
  inverse: QuickEditHomography;
  /** Hard rectangles partition adjoining source planes; exterior contours retain antialiasing. */
  clip?: { rect: CameraSpatialRect; radius: number; shape?: 'ellipse' | 'hard-rect' };
  lens?: {
    bounds: CameraSpatialRect;
    scale: number;
    optics: 'flat' | 'optical';
    edgeWidth: number;
    corner: number | 'circle';
  };
  blur?: number;
  depth?: {
    frame: CameraSpatialFrame;
    window: CameraSpatialRect;
    planeInverse?: QuickEditHomography;
  };
  opacity?: number;
  orientation?: { rotation: 0 | 90 | 180 | 270; flip: boolean };
  /** Raster texel edges adjoining another plane; retain sampled alpha without transparent padding. */
  clampSourceEdges?: readonly ('left' | 'top' | 'right' | 'bottom')[];
  /** Fuses an RGBA8 source write and destination-in raster mask in the source plane. */
  alphaMask?: {
    source: Raster;
    rect: CameraSpatialRect;
    cache?: { key: string; revision: object | string | number };
  };
  blend?: 'over' | 'add' | 'mask' | 'erase' | 'screen' | 'atop';
  cssFilter?: { blur?: number; brightness?: number; saturate?: number };
  tint?: readonly [number, number, number, number];
  /** Coverage of the destination operation, not a mask in the source plane. */
  operationClip?: {
    source: Raster;
    cache?: { key: string; revision: object | string | number };
  };
  cache?: { key: string; revision: object | string | number };
}

/** The caller retains frame/publication authority and closes each returned bitmap. */
export interface GpuPreviewRenderer {
  readonly allocatedBytes: number;
  /**
   * Validates and snapshots pipeline requirements synchronously. Sources are borrowed only
   * until this call returns, including when compilation is pending. No pixels are uploaded
   * or drawn, and no frame slot or output surface is acquired.
   */
  preparePipelines?(args: Pick<Request, 'output' | 'logical' | 'layers' | 'signal'>): Promise<void>;
  /**
   * The caller leases a nonfront canvas and publishes matching geometry after completion.
   * Offscreen mode moves completed GPU images into a fixed-size HTML bitmaprenderer.
   * Callers release each transferred image when their output lease ends. They must not resize
   * or select a context on that canvas. The default preserves caller-owned HTML WebGPU resize.
   */
  createSurface?(
    canvas: HTMLCanvasElement,
    options?: { offscreen?: boolean }
  ): GpuPreviewPresentationSurface;
  render(args: {
    output: Size;
    logical: Size;
    layers: readonly GpuPreviewLayer[];
    signal: AbortSignal;
    /** Synchronous notice after submit; inputs remain borrowed until this request settles. */
    onSubmitted?: () => void;
  }): Promise<ImageBitmap>;
  dispose(): void;
}

/** The frontend owns placement and publication; this surface borrows inputs until execution settles. */
export interface GpuPreviewPresentationSurface {
  readonly canvas: HTMLCanvasElement;
  present(request: Request): Promise<void>;
  /** End the frontend lease; retain the bounded idle image until replacement or retirement. */
  releaseImage?(): void;
  dispose(): void;
}
