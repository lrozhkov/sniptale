import type { EffectRuntimeGpuPlanResult } from '../../../../../contracts/effect-runtime/types';
import type { EffectRuntimeGpuPass } from '../../../../../contracts/effect-runtime/gpu-plan';
import {
  GPU_PREVIEW_LIMITS,
  type GpuPreviewRenderer,
  type GpuPreviewLayer,
  type GpuPreviewGroup,
} from '../../canvas/gpu-preview';
import {
  EFFECT_RUNTIME_RESOURCE_LIMITS,
  EffectRuntimeResourceError,
} from '../runtime/resource-limits';
import { buildEffectRuntimeGpuOperationLayers } from './gpu-plan-layers';

/** Materialize valid complex plans on a borrowed device; never close caller-owned wire resources. */
export async function materializeEffectRuntimeGpuPlan(
  plan: EffectRuntimeGpuPlanResult,
  gpu: GpuPreviewRenderer,
  signal: AbortSignal
): Promise<ImageBitmap> {
  const owned = new Set<ImageBitmap>();
  try {
    const resources = new Map(plan.resources.map((resource) => [resource.id, resource]));
    const completed = new Map<number, ImageBitmap>();
    const lastUse = new Map<number, number>();
    plan.passes.forEach((pass, index) =>
      pass.operations.forEach((operation) => {
        if (operation.op === 'draw' && operation.source.kind === 'pass')
          lastUse.set(operation.source.id, index);
      })
    );
    const borrowedBytes = plan.resources.reduce(
      (sum, resource) => sum + resource.width * resource.height * 4,
      0
    );
    const close = (bitmap: ImageBitmap) => {
      owned.delete(bitmap);
      bitmap.close();
    };
    const submit = async (pass: EffectRuntimeGpuPass, layers: readonly GpuPreviewLayer[]) => {
      signal.throwIfAborted();
      const retainedBytes = [...owned].reduce(
        (sum, bitmap) => sum + bitmap.width * bitmap.height * 4,
        borrowedBytes
      );
      if (
        retainedBytes + pass.width * pass.height * 4 >
        EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedRasterBytes
      )
        throw new EffectRuntimeResourceError();
      // The shared renderer settles only after its queue fence, including failed/aborted encodes.
      const bitmap = await gpu.render({
        output: { width: pass.width, height: pass.height },
        logical: { width: pass.width, height: pass.height },
        layers,
        signal: signal,
      });
      owned.add(bitmap);
      signal.throwIfAborted();
      return bitmap;
    };
    for (const [index, pass] of plan.passes.entries()) {
      signal.throwIfAborted();
      let accumulated: ImageBitmap | undefined;
      let layers: GpuPreviewLayer[] = [];
      let recursiveLayers = 0;
      const flush = async () => {
        const bitmap = await submit(pass, layers);
        if (accumulated) close(accumulated);
        accumulated = bitmap;
        layers = [bitmapLayer(bitmap, pass)];
        recursiveLayers = 1;
      };
      for (const operation of pass.operations) {
        const operationLayers = buildEffectRuntimeGpuOperationLayers(
          operation,
          { width: pass.width, height: pass.height },
          (source) => {
            if (source.kind === 'resource') {
              return resolveGpuPlanResource(resources, source.id);
            }
            const bitmap = completed.get(source.id);
            if (!bitmap) throw new Error('Effect GPU pass reference is unavailable.');
            return { source: bitmap, width: bitmap.width, height: bitmap.height };
          },
          (id) => resolveGpuPlanCoverage(resources, id)
        );
        if (operationLayers.clear) {
          layers = [];
          recursiveLayers = 0;
          if (accumulated) {
            close(accumulated);
            accumulated = undefined;
          }
          continue;
        }
        const count = countLayers(operationLayers.layers);
        if (operationLayers.layers.length > 63 || count > 511)
          throw new Error('Effect GPU operation layer budget exceeded.');
        if (layers.length + operationLayers.layers.length > 64 || recursiveLayers + count > 512)
          await flush();
        layers.push(...operationLayers.layers);
        recursiveLayers += count;
      }
      if (!accumulated || layers.length > 1 || layers[0]?.source !== accumulated) await flush();
      if (!accumulated) throw new Error('Effect GPU pass did not complete.');
      completed.set(pass.id, accumulated);
      for (const [id, bitmap] of completed) {
        if (id !== plan.rootPass && (lastUse.get(id) ?? -1) <= index) {
          completed.delete(id);
          close(bitmap);
        }
      }
    }
    const root = completed.get(plan.rootPass);
    if (!root) throw new Error('Effect GPU root pass is unavailable.');
    signal.throwIfAborted();
    owned.delete(root);
    return root;
  } finally {
    for (const bitmap of owned) bitmap.close();
  }
}

function bitmapLayer(
  bitmap: ImageBitmap,
  size: { width: number; height: number }
): GpuPreviewLayer {
  return {
    source: bitmap,
    rect: { x: 0, y: 0, width: size.width, height: size.height },
    inverse: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  };
}
function countLayers(layers: readonly GpuPreviewLayer[]): number {
  return layers.reduce(
    (sum, layer) => sum + 1 + (isGroup(layer.source) ? countLayers(layer.source.layers) : 0),
    0
  );
}
function isGroup(source: GpuPreviewLayer['source']): source is GpuPreviewGroup {
  return 'kind' in source && source.kind === 'group';
}

const planGroups = new WeakMap<GpuPreviewGroup, EffectRuntimeGpuPlanResult>();

/** Build immutable groups. Evaluation and raster ownership remain outside the device backend. */
export function buildEffectRuntimeGpuPlan(plan: EffectRuntimeGpuPlanResult): GpuPreviewGroup {
  const resources = new Map(plan.resources.map((resource) => [resource.id, resource]));
  const completed = new Map<number, GpuPreviewGroup>();
  for (const pass of plan.passes) {
    let layers: GpuPreviewLayer[] = [];
    for (const operation of pass.operations) {
      const prepared = buildEffectRuntimeGpuOperationLayers(
        operation,
        { width: pass.width, height: pass.height },
        (source) => {
          if (source.kind === 'resource') {
            return resolveGpuPlanResource(resources, source.id);
          }
          const group = completed.get(source.id);
          if (!group) throw new Error('Effect GPU pass reference is unavailable.');
          return { source: group, ...group.output };
        },
        (id) => resolveGpuPlanCoverage(resources, id)
      );
      if (prepared.clear) layers = [];
      else layers.push(...prepared.layers);
    }
    completed.set(pass.id, {
      kind: 'group',
      output: { width: pass.width, height: pass.height },
      logical: { width: pass.width, height: pass.height },
      layers,
    });
  }
  const root = completed.get(plan.rootPass);
  if (!root) throw new Error('Effect GPU root pass is unavailable.');
  planGroups.set(root, plan);
  return root;
}

/** Check the entire final graph, including editor wrappers, before choosing same-device chunks. */
export async function prepareEffectRuntimeGpuScene(args: {
  layers: readonly GpuPreviewLayer[];
  gpu: GpuPreviewRenderer;
  signal: AbortSignal;
}): Promise<{ layers: readonly GpuPreviewLayer[]; release(): void }> {
  const owned = new Set<ImageBitmap>();
  const replacements = new Map<GpuPreviewGroup, ImageBitmap>();
  const release = () => {
    for (const bitmap of owned) bitmap.close();
    owned.clear();
  };
  const fits = (
    layers: readonly GpuPreviewLayer[],
    depth = 0,
    count = { value: 0 },
    seen = new Set<GpuPreviewGroup>()
  ): boolean => {
    if (layers.length > GPU_PREVIEW_LIMITS.layersPerPass || depth > GPU_PREVIEW_LIMITS.groupDepth)
      return false;
    for (const layer of layers) {
      if (++count.value > GPU_PREVIEW_LIMITS.totalLayers) return false;
      if (isGroup(layer.source) && !seen.has(layer.source)) {
        if (!fits(layer.source.layers, depth + 1, count, seen)) return false;
        seen.add(layer.source);
      }
    }
    return true;
  };
  const compact = async (
    layers: readonly GpuPreviewLayer[]
  ): Promise<readonly GpuPreviewLayer[]> => {
    const result: GpuPreviewLayer[] = [];
    for (const layer of layers) {
      args.signal.throwIfAborted();
      if (!isGroup(layer.source)) {
        result.push(layer);
        continue;
      }
      const source = layer.source;
      const plan = planGroups.get(source);
      if (plan) {
        let bitmap = replacements.get(source);
        if (!bitmap) {
          bitmap = await materializeEffectRuntimeGpuPlan(plan, args.gpu, args.signal);
          owned.add(bitmap);
          replacements.set(source, bitmap);
        }
        result.push({ ...layer, source: bitmap });
      } else {
        result.push({ ...layer, source: { ...source, layers: await compact(source.layers) } });
      }
    }
    return result;
  };
  try {
    if (fits(args.layers)) return { layers: args.layers, release };
    const layers = await compact(args.layers);
    // Preserve existing rejection when non-effect scene content itself exceeds backend limits.
    if (!fits(layers)) throw new Error('GPU preview scene budget exceeded.');
    return { layers, release };
  } catch (error) {
    release();
    throw error;
  }
}

type GpuPlanResources = ReadonlyMap<number, EffectRuntimeGpuPlanResult['resources'][number]>;

function resolveGpuPlanResource(resources: GpuPlanResources, id: number) {
  const resource = resources.get(id);
  if (!resource) throw new Error('Effect GPU resource reference is unavailable.');
  return { source: resource.bitmap, width: resource.width, height: resource.height };
}

function resolveGpuPlanCoverage(resources: GpuPlanResources, id: number) {
  const resource = resources.get(id);
  if (!resource || resource.kind !== 'coverage')
    throw new Error('Effect GPU coverage reference is unavailable.');
  return resource.bitmap;
}
