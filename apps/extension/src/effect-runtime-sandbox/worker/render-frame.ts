import { createEffectFrameCanvasBudget, EffectRuntimeResourceError } from './resource-policy';
import {
  closeEffectRuntimeBitmaps,
  isImageBitmap,
} from '../../contracts/effect-runtime/bitmap-lifetime';
import {
  createEffectRuntimeFailure,
  getEffectRuntimeIdentity,
} from '../../contracts/effect-runtime/identity';
import type {
  EffectRuntimeFrameResult,
  EffectRuntimeWorkerRequest,
  EffectRuntimeWorkerResult,
} from '../../contracts/effect-runtime/types';
import { createLogicalCanvasFactory } from './canvas/logical-canvas';
import type { EffectRuntimeCanvasPool } from './canvas/pool';
import type { EffectV1GraphRenderer } from './interpreter/graph-renderer';
import type { RuntimeCanvas } from './model/types';
import type { EffectRuntimePreparedRenderModel } from './render-context';
import { createEffectRuntimeRenderContext } from './render-context';
import { clearSvgVectorCache } from './svg/vector-parser';
import { createEffectRuntimeGpuTarget } from './interpreter/gpu-target';

export interface PreparedEffectRuntimeModel {
  document: EffectRuntimeWorkerRequest['document'];
  normalized: EffectRuntimePreparedRenderModel;
  renderer: EffectV1GraphRenderer;
}

export async function executePreparedEffectRuntimeWorkerRequest(
  request: EffectRuntimeWorkerRequest,
  model: PreparedEffectRuntimeModel,
  canvasPool: EffectRuntimeCanvasPool
): Promise<EffectRuntimeWorkerResult> {
  let adoptedInputs = false;
  try {
    const result = await renderEffectRuntimeFrame(request, model, canvasPool);
    adoptedInputs = result.kind === 'gpu-plan';
    return result;
  } catch (error) {
    return createEffectRuntimeFailure(
      request,
      error instanceof EffectRuntimeResourceError ? 'resourceLimit' : 'outputRejected'
    );
  } finally {
    clearSvgVectorCache();
    if (!adoptedInputs) closeEffectRuntimeBitmaps(request.inputFrames);
  }
}

async function renderEffectRuntimeFrame(
  request: EffectRuntimeWorkerRequest,
  model: PreparedEffectRuntimeModel,
  canvasPool: EffectRuntimeCanvasPool
): Promise<EffectRuntimeWorkerResult> {
  if (
    request.document.assets.some(({ kind }) => kind === 'svg') &&
    typeof globalThis.Path2D !== 'function'
  ) {
    throw new Error('SVG_PATH_RUNTIME_UNAVAILABLE');
  }
  const releases: Array<() => void> = [];
  const canvasBudget = createEffectFrameCanvasBudget();
  let liveCanvasBytes = 0;
  let gpu: ReturnType<typeof createEffectRuntimeGpuTarget> | null = null;
  const allocate = (width: number, height: number) => {
    const bytes = width * height * 4;
    gpu?.admitCanvas(bytes);
    const release = canvasBudget.allocate(width, height);
    liveCanvasBytes += bytes;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      liveCanvasBytes -= bytes;
      release();
    };
  };
  const createCanvas = createRuntimeCanvasFactory(request, canvasPool, releases, allocate);
  gpu =
    request.renderTarget === 'gpu-plan'
      ? createEffectRuntimeGpuTarget(request, allocate, () => liveCanvasBytes)
      : null;
  try {
    const context = createEffectRuntimeRenderContext(request, createCanvas, model.normalized);
    const output = await model.renderer.renderFrame(context, gpu?.target);
    return gpu ? await gpu.finish(output) : createFrameResult(request, output);
  } finally {
    gpu?.dispose();
    releases.forEach((release) => release());
  }
}

function createRuntimeCanvasFactory(
  request: EffectRuntimeWorkerRequest,
  canvasPool: EffectRuntimeCanvasPool,
  releases: Array<() => void>,
  allocate: (width: number, height: number) => () => void
) {
  let slot = 0;
  const createPhysicalCanvas = (width: number, height: number): RuntimeCanvas => {
    const releaseBudget = allocate(width, height);
    try {
      const lease = canvasPool.lease({
        effectInstanceId: request.effectInstanceId,
        height,
        slot: slot++,
        width,
      });
      releases.push(() => {
        lease.release();
        releaseBudget();
      });
      return lease.canvas;
    } catch (error) {
      releaseBudget();
      throw error;
    }
  };
  return createLogicalCanvasFactory({
    createCanvas: createPhysicalCanvas,
    outputHeight: request.height,
    outputWidth: request.width,
    renderHeight: request.renderHeight,
    renderWidth: request.renderWidth,
  });
}

function createFrameResult(
  request: EffectRuntimeWorkerRequest,
  output: RuntimeCanvas
): EffectRuntimeFrameResult {
  if (
    output.width !== request.renderWidth ||
    output.height !== request.renderHeight ||
    !output.transferToImageBitmap
  ) {
    throw new Error('OUTPUT_CANVAS_INVALID');
  }
  const bitmap: unknown = output.transferToImageBitmap();
  if (
    !isImageBitmap(bitmap) ||
    bitmap.width !== request.renderWidth ||
    bitmap.height !== request.renderHeight
  ) {
    if (isImageBitmap(bitmap)) bitmap.close();
    throw new Error('OUTPUT_BITMAP_INVALID');
  }
  return {
    ...getEffectRuntimeIdentity(request),
    acknowledged: {
      assetSelectionId: request.assetSelectionId,
      documentId: request.documentId,
    },
    bitmap,
    height: bitmap.height,
    kind: 'frame',
    width: bitmap.width,
  };
}
