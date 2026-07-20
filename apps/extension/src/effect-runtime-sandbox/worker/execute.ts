import {
  createEffectRuntimeFailure,
  getEffectRuntimeIdentity,
} from '../../contracts/effect-runtime/identity';
import { closeEffectRuntimeBitmaps } from '../../contracts/effect-runtime/bitmap-lifetime';
import type { EffectRuntimeFrameResult } from '../../contracts/effect-runtime/types';
import { drawImageAsset } from './assets/render-assets';
import { createEffectRuntimeWorkerAssetCache } from './cache/assets';
import { createEffectRuntimePreparedModelCache } from './cache/models';
import { createEffectRuntimeCanvasPool, type EffectRuntimeCanvasPool } from './canvas/pool';
import { createEffectV1GraphRenderer } from './interpreter/graph-renderer';
import type { EffectRuntimeInterpreter } from './interpreter/model';
import type { RuntimeCanvas } from './model/types';
import { resolveEffectRuntimeWorkerRequest } from './protocol/request';
import { prepareEffectRuntimeRenderModel } from './render-context';
import {
  executePreparedEffectRuntimeWorkerRequest,
  type PreparedEffectRuntimeModel,
} from './render-frame';
import { createSvgPartTransform } from './svg/part-transform';
import { drawSvgVectorAsset } from './svg/vector-renderer';
import { clearSvgVectorCache } from './svg/vector-parser';

interface EffectRuntimeWorkerExecutionDependencies {
  createCanvas(width: number, height: number): RuntimeCanvas;
}

interface EffectRuntimeWorkerExecutionResources {
  assets: ReturnType<typeof createEffectRuntimeWorkerAssetCache>;
  canvases: EffectRuntimeCanvasPool;
  models: ReturnType<typeof createEffectRuntimePreparedModelCache<PreparedEffectRuntimeModel>>;
  runtime: EffectRuntimeInterpreter;
}

interface EffectRuntimeWorkerExecutionState {
  dispose(): void;
  execute(value: unknown): Promise<EffectRuntimeFrameResult>;
  snapshot(): {
    assets: { bytes: number; entries: number; selections: number };
    canvases: { entries: number; leases: number };
    models: { entries: number };
  };
}

export function createEffectRuntimeWorkerExecutionState(
  dependencies: EffectRuntimeWorkerExecutionDependencies = {
    createCanvas: (width, height) => new OffscreenCanvas(width, height),
  }
): EffectRuntimeWorkerExecutionState {
  const runtime: EffectRuntimeInterpreter = {
    drawImageAsset,
    drawSvgVectorAsset,
    svgPartTransform: createSvgPartTransform,
  };
  const assets = createEffectRuntimeWorkerAssetCache();
  const models = createEffectRuntimePreparedModelCache<PreparedEffectRuntimeModel>();
  const canvases = createEffectRuntimeCanvasPool({ createCanvas: dependencies.createCanvas });
  const resources = { assets, canvases, models, runtime };
  return {
    dispose: () => disposeExecutionResources(resources),
    execute: (value) => executeWithResources(value, resources),
    snapshot: () => ({
      assets: assets.snapshot(),
      canvases: canvases.snapshot(),
      models: models.snapshot(),
    }),
  };
}

function disposeExecutionResources(resources: EffectRuntimeWorkerExecutionResources): void {
  resources.assets.clear();
  resources.models.clear();
  resources.canvases.clear();
  clearSvgVectorCache();
}

async function executeWithResources(
  value: unknown,
  resources: EffectRuntimeWorkerExecutionResources
): Promise<EffectRuntimeFrameResult> {
  const resolution = resolveEffectRuntimeWorkerRequest(value, {
    getAssets: (id) => resources.assets.get(id),
    getDocument: (id) => resources.models.get(id)?.document ?? null,
    setAssets: (id, assets) => resources.assets.set(id, assets),
    setDocument(id, document) {
      resources.models.set(id, {
        document,
        normalized: prepareEffectRuntimeRenderModel(document),
        renderer: createEffectV1GraphRenderer(document, resources.runtime),
      });
    },
  });
  if (!resolution.ok) return createResolutionFailure(value, resolution);
  const model = resources.models.get(resolution.request.documentId);
  if (!model) {
    closeEffectRuntimeBitmaps(resolution.request.inputFrames);
    return createEffectRuntimeFailure(resolution.request, 'crashed');
  }
  return executePreparedEffectRuntimeWorkerRequest(resolution.request, model, resources.canvases);
}

function createResolutionFailure(
  value: unknown,
  resolution: Exclude<ReturnType<typeof resolveEffectRuntimeWorkerRequest>, { ok: true }>
): EffectRuntimeFrameResult {
  closeEffectRuntimeBitmaps(value);
  return resolution.code === 'cacheMiss'
    ? {
        ...getEffectRuntimeIdentity(value),
        code: 'cacheMiss',
        kind: 'error',
        missingRef: resolution.missingRef,
      }
    : createEffectRuntimeFailure(value, resolution.code);
}

export function executeEffectRuntimeWorkerRequest(
  value: unknown,
  dependencies: EffectRuntimeWorkerExecutionDependencies = {
    createCanvas: (width, height) => new OffscreenCanvas(width, height),
  },
  state?: EffectRuntimeWorkerExecutionState
): Promise<EffectRuntimeFrameResult> {
  if (state) return state.execute(value);
  const ownedState = createEffectRuntimeWorkerExecutionState(dependencies);
  return ownedState.execute(value).finally(() => ownedState.dispose());
}
