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
} from '../../contracts/effect-runtime/types';
import { createLogicalCanvasFactory } from './canvas/logical-canvas';
import type { EffectRuntimeCanvasPool } from './canvas/pool';
import type { EffectV1GraphRenderer } from './interpreter/graph-renderer';
import type { RuntimeCanvas } from './model/types';
import type { EffectRuntimePreparedRenderModel } from './render-context';
import { createEffectRuntimeRenderContext } from './render-context';
import { clearSvgVectorCache } from './svg/vector-parser';

export interface PreparedEffectRuntimeModel {
  document: EffectRuntimeWorkerRequest['document'];
  normalized: EffectRuntimePreparedRenderModel;
  renderer: EffectV1GraphRenderer;
}

export async function executePreparedEffectRuntimeWorkerRequest(
  request: EffectRuntimeWorkerRequest,
  model: PreparedEffectRuntimeModel,
  canvasPool: EffectRuntimeCanvasPool
): Promise<EffectRuntimeFrameResult> {
  try {
    return await renderEffectRuntimeFrame(request, model, canvasPool);
  } catch (error) {
    return createEffectRuntimeFailure(
      request,
      error instanceof EffectRuntimeResourceError ? 'resourceLimit' : 'outputRejected'
    );
  } finally {
    clearSvgVectorCache();
    closeEffectRuntimeBitmaps(request.inputFrames);
  }
}

async function renderEffectRuntimeFrame(
  request: EffectRuntimeWorkerRequest,
  model: PreparedEffectRuntimeModel,
  canvasPool: EffectRuntimeCanvasPool
): Promise<EffectRuntimeFrameResult> {
  if (
    request.document.assets.some(({ kind }) => kind === 'svg') &&
    typeof globalThis.Path2D !== 'function'
  ) {
    throw new Error('SVG_PATH_RUNTIME_UNAVAILABLE');
  }
  const releases: Array<() => void> = [];
  const createCanvas = createRuntimeCanvasFactory(request, canvasPool, releases);
  try {
    const context = createEffectRuntimeRenderContext(request, createCanvas, model.normalized);
    return createFrameResult(request, await model.renderer.renderFrame(context));
  } finally {
    releases.forEach((release) => release());
  }
}

function createRuntimeCanvasFactory(
  request: EffectRuntimeWorkerRequest,
  canvasPool: EffectRuntimeCanvasPool,
  releases: Array<() => void>
) {
  const canvasBudget = createEffectFrameCanvasBudget();
  let slot = 0;
  const createPhysicalCanvas = (width: number, height: number): RuntimeCanvas => {
    const releaseBudget = canvasBudget.allocate(width, height);
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
