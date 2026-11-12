import { returnEffectRuntimeRetryInputs } from '../../contracts/effect-runtime/retry-inputs';
import {
  createEffectRuntimeFailure,
  getEffectRuntimeIdentity,
} from '../../contracts/effect-runtime/identity';
import { closeEffectRuntimeBitmaps } from '../../contracts/effect-runtime/bitmap-lifetime';
import type {
  EffectRuntimeWorkerResult,
  EffectRuntimeWorkerRequest,
} from '../../contracts/effect-runtime/types';
import { createEffectRuntimePreparedModelCache } from './cache/models';
import { resolveEffectRuntimeWorkerRequest } from './protocol/request';
import { createLottieFrameRenderer, LottieResourceIdentityError } from './lottie';
import { EFFECT_RUNTIME_RESOURCE_LIMITS, EffectRuntimeResourceError } from './resource-policy';

type Renderer = Awaited<ReturnType<typeof createLottieFrameRenderer>>;
interface PreparedModel {
  document: EffectRuntimeWorkerRequest['document'];
  sourceBytes: number;
  retainedBytes: number;
  renderer: Renderer | null;
  loading: Promise<Renderer> | null;
  retired: boolean;
}
interface ExecutionDependencies {
  createRenderer: typeof createLottieFrameRenderer;
}
const defaultDependencies: ExecutionDependencies = { createRenderer: createLottieFrameRenderer };

/** A worker serializes mutable Lottie players; the parent still owns stale publication and timeout termination. */
export function createEffectRuntimeWorkerExecutionState(
  dependencies: ExecutionDependencies = defaultDependencies
) {
  let disposed = false;
  const lifetime = new AbortController();
  const models = createEffectRuntimePreparedModelCache<PreparedModel>({
    dispose(model) {
      model.retired = true;
      model.renderer?.dispose();
    },
    weight: (model) => model.sourceBytes + model.retainedBytes,
    maximumWeight: EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedRasterBytes,
  });
  const assets = new Map<string, Record<string, never>>();
  let queue: Promise<void> = Promise.resolve();
  const execute = async (value: unknown): Promise<EffectRuntimeWorkerResult> => {
    if (disposed) {
      closeEffectRuntimeBitmaps(value);
      return createEffectRuntimeFailure(value, 'stale');
    }
    try {
      const resolution = resolveEffectRuntimeWorkerRequest(value, {
        getAssets: (id) => assets.get(id) ?? null,
        getDocument: (id) => models.get(id)?.document ?? null,
        setAssets(id, supplied) {
          if (Object.keys(supplied).length) return false;
          assets.delete(id);
          while (assets.size >= 8) {
            const oldest = assets.keys().next().value;
            if (oldest === undefined) return false;
            assets.delete(oldest);
          }
          assets.set(id, {});
          return true;
        },
        setDocument(id, document) {
          const sourceBytes = new TextEncoder().encode(JSON.stringify(document)).byteLength;
          if (
            !models.set(id, {
              document,
              sourceBytes,
              retainedBytes: 0,
              renderer: null,
              loading: null,
              retired: false,
            })
          )
            throw new EffectRuntimeResourceError();
        },
      });
      if (!resolution.ok) {
        if (resolution.code === 'cacheMiss')
          return returnEffectRuntimeRetryInputs(value, resolution.missingRef);
        closeEffectRuntimeBitmaps(value);
        return createEffectRuntimeFailure(value, resolution.code);
      }
      const request = resolution.request,
        model = models.get(request.documentId);
      if (!model) return createEffectRuntimeFailure(request, 'crashed');
      const previousBytes = model.retainedBytes;
      model.retainedBytes = request.renderWidth * request.renderHeight * 4;
      if (!models.set(request.documentId, model)) {
        model.retainedBytes = previousBytes;
        throw new EffectRuntimeResourceError();
      }
      model.loading ??= dependencies.createRenderer(model.document).then((renderer) => {
        if (disposed || model.retired) {
          renderer.dispose();
          throw new DOMException('Animation model was retired.', 'AbortError');
        }
        model.renderer = renderer;
        return renderer;
      });
      const renderer = await model.loading;
      lifetime.signal.throwIfAborted();
      const bitmap = await renderer.render({
        time: request.time,
        width: request.renderWidth,
        height: request.renderHeight,
        values: request.controls,
        signal: lifetime.signal,
      });
      if (disposed || model.retired) {
        bitmap.close();
        return createEffectRuntimeFailure(request, 'stale');
      }
      if (bitmap.width !== request.renderWidth || bitmap.height !== request.renderHeight) {
        bitmap.close();
        return createEffectRuntimeFailure(request, 'outputRejected');
      }
      return {
        ...getEffectRuntimeIdentity(request),
        kind: 'frame',
        bitmap,
        width: bitmap.width,
        height: bitmap.height,
        acknowledged: {
          documentId: request.documentId,
          assetSelectionId: request.assetSelectionId,
        },
      };
    } catch (error) {
      closeEffectRuntimeBitmaps(value);
      return createEffectRuntimeFailure(
        value,
        disposed
          ? 'stale'
          : error instanceof LottieResourceIdentityError
            ? 'inputRejected'
            : error instanceof EffectRuntimeResourceError
              ? 'resourceLimit'
              : 'outputRejected'
      );
    }
  };
  return {
    execute(value: unknown): Promise<EffectRuntimeWorkerResult> {
      const result = queue.then(() => execute(value));
      queue = result.then(
        () => undefined,
        () => undefined
      );
      return result;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      lifetime.abort();
      models.clear();
      assets.clear();
    },
    snapshot: () => ({
      models: models.snapshot(),
      assets: { entries: assets.size, bytes: 0 },
      canvases: { entries: models.snapshot().entries },
    }),
  };
}

export async function executeEffectRuntimeWorkerRequest(
  value: unknown,
  dependencies: ExecutionDependencies = defaultDependencies,
  state?: ReturnType<typeof createEffectRuntimeWorkerExecutionState>
): Promise<EffectRuntimeWorkerResult> {
  if (state) return state.execute(value);
  const owned = createEffectRuntimeWorkerExecutionState(dependencies);
  try {
    return await owned.execute(value);
  } finally {
    owned.dispose();
  }
}
