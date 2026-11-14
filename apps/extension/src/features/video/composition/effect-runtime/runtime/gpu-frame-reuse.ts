import type { AnimationTemplate } from '@sniptale/runtime-contracts/animation-template';
import {
  animationRuntimeFrameIndex,
  parseRuntimeAnimationFrame,
  verifyRuntimeAnimationSource,
} from '../../../../../contracts/effect-runtime/animation';
import { createEffectRuntimeGpuContentKey } from './gpu-frame-content';
import { prepareEffectRuntimeGpuFramePlans } from './gpu-driver';
import { EFFECT_RUNTIME_RESOURCE_LIMITS, assertEffectRasterDimensions } from './resource-limits';
import type { EffectRuntimeFramePlan, EffectRuntimeGpuPreparedFrame } from './types';

type Preparation = Parameters<typeof prepareEffectRuntimeGpuFramePlans>[0];
type Signature = { key: string; document: AnimationTemplate };
type Entry = {
  document: AnimationTemplate;
  frame: EffectRuntimeGpuPreparedFrame;
  signature: string;
  source: string;
  digest: string;
  bytes: number;
  readers: number;
  retired: boolean;
  released: boolean;
  cache: NonNullable<EffectRuntimeGpuPreparedFrame['rasterCache']>;
};

/** Own completed Lottie pixels independently of frame placement, requests and GPU readers. */
export function createEffectRuntimeGpuFrameReuse() {
  const entries = new Map<string, Entry>();
  const documents = new Map<
    string,
    { source: string; digest: string; document: AnimationTemplate }
  >();
  const contentKeys = new WeakMap<
    AnimationTemplate,
    ReturnType<typeof createEffectRuntimeGpuContentKey>
  >();
  const lifetime = new AbortController();
  let executor: Preparation['executor'] | undefined;
  let context: object | undefined;
  let identity: string | undefined;
  let retainedBytes = 0;
  let disposed = false;
  const finish = (entry: Entry) => {
    if (!entry.retired || entry.readers || entry.released) return;
    entry.released = true;
    entry.frame.dispose();
  };
  const retire = (id: string) => {
    const entry = entries.get(id);
    if (!entry) return;
    entries.delete(id);
    retainedBytes -= entry.bytes;
    entry.retired = true;
    finish(entry);
  };
  const clear = () => {
    for (const id of entries.keys()) retire(id);
    documents.clear();
  };
  const borrow = (entry: Entry, plan: EffectRuntimeFramePlan): EffectRuntimeGpuPreparedFrame => {
    entry.readers++;
    let retired = false;
    let borrowers = 0;
    let released = false;
    const release = () => {
      if (!retired || borrowers || released) return;
      released = true;
      entry.readers--;
      finish(entry);
    };
    const { bitmapBounds: _bounds, ...frame } = entry.frame;
    return {
      ...frame,
      effectInstanceId: plan.effectInstanceId,
      snapshotId: plan.snapshotId,
      target: plan.target,
      kind: plan.kind,
      ...(plan.bitmapBounds ? { bitmapBounds: plan.bitmapBounds } : {}),
      rasterCache: entry.cache,
      retain() {
        if (retired) throw new Error('EFFECT_RUNTIME_GPU_FRAME_RETIRED');
        borrowers++;
        let returned = false;
        return {
          release() {
            if (returned) return;
            returned = true;
            borrowers--;
            release();
          },
        };
      },
      dispose() {
        retired = true;
        release();
      },
    };
  };
  const signature = async (
    plan: EffectRuntimeFramePlan,
    admitted?: NonNullable<Preparation['documents']>
  ): Promise<Signature | null> => {
    if (
      plan.kind !== 'standalone' ||
      (plan.target.kind !== 'scene' && plan.target.kind !== 'clip') ||
      plan.assets.length
    )
      return null;
    let prepared = documents.get(plan.effectInstanceId);
    if (prepared?.source !== plan.documentSource || prepared.digest !== plan.documentSha256) {
      const verified = admitted?.get(plan.effectInstanceId);
      if (
        verified &&
        (verified.source !== plan.documentSource || verified.sha256 !== plan.documentSha256)
      )
        throw new Error('EFFECT_RUNTIME_ANIMATION_SOURCE_REJECTED');
      const document =
        verified?.document ??
        (await verifyRuntimeAnimationSource(plan.documentSource, plan.documentSha256));
      if (!document || disposed || lifetime.signal.aborted) return null;
      prepared = { source: plan.documentSource, digest: plan.documentSha256, document };
      documents.set(plan.effectInstanceId, prepared);
    }
    const document = prepared.document;
    if (
      !document ||
      !parseRuntimeAnimationFrame(
        {
          controls: plan.controls,
          width: plan.dimensions.width,
          height: plan.dimensions.height,
          inputFrames: {},
          duration: plan.duration,
          time: plan.time,
          progress: plan.progress,
          fps: plan.fps,
          frameIndex: plan.frameIndex,
        },
        document
      )
    )
      return null;
    assertEffectRasterDimensions(plan.renderDimensions.width, plan.renderDimensions.height);
    let contentKey = contentKeys.get(document);
    if (!contentKey) {
      contentKey = createEffectRuntimeGpuContentKey(document);
      contentKeys.set(document, contentKey);
    }
    return {
      document,
      key: JSON.stringify([
        plan.documentSha256,
        plan.controls,
        plan.dimensions,
        plan.renderDimensions,
        plan.bitmapBounds,
        contentKey(animationRuntimeFrameIndex(document.animation, plan.time)),
      ]),
    };
  };
  return {
    async prepare(args: Preparation): Promise<ReadonlyMap<string, EffectRuntimeGpuPreparedFrame>> {
      if (disposed) throw new Error('EFFECT_RUNTIME_GPU_FRAME_REUSE_DISPOSED');
      args.signal?.throwIfAborted();
      const signal = args.signal
        ? AbortSignal.any([args.signal, lifetime.signal])
        : lifetime.signal;
      const nextContext = args.executor.gpuFrameReuseContext;
      if (!nextContext) {
        clear();
        executor = undefined;
        context = undefined;
        return prepareEffectRuntimeGpuFramePlans({ ...args, signal });
      }
      if (executor !== args.executor || context !== nextContext) {
        clear();
        executor = args.executor;
        context = nextContext;
      }
      const active = new Set(args.plans.map((plan) => plan.effectInstanceId));
      for (const id of documents.keys()) if (!active.has(id)) documents.delete(id);
      const views = new Map<string, EffectRuntimeGpuPreparedFrame>();
      const signatures = new Map<string, Signature | null>();
      const missing: EffectRuntimeFramePlan[] = [];
      const transferred = new Set<EffectRuntimeGpuPreparedFrame>();
      let fresh: ReadonlyMap<string, EffectRuntimeGpuPreparedFrame> | undefined;
      const checkContext = () => {
        signal.throwIfAborted();
        const actual = args.executor.gpuFrameReuseContext;
        if (executor !== args.executor || context !== nextContext || actual !== nextContext)
          throw new Error('EFFECT_RUNTIME_GPU_FRAME_REUSE_CONTEXT_RETIRED');
      };
      try {
        for (const plan of args.plans) {
          const key = await signature(plan, args.documents);
          checkContext();
          signatures.set(plan.effectInstanceId, key);
          const entry = entries.get(plan.effectInstanceId);
          if (key !== null && entry?.signature === key.key && entry.source === plan.documentSource)
            views.set(plan.effectInstanceId, borrow(entry, plan));
          else missing.push(plan);
        }
        if (missing.length) {
          // Old GPU readers keep their leases; unused completed pixels do not consume miss headroom.
          for (const plan of missing) retire(plan.effectInstanceId);
          for (const [id, entry] of entries) if (!entry.readers) retire(id);
          fresh = await prepareEffectRuntimeGpuFramePlans({
            ...args,
            plans: missing,
            signal,
            documents: new Map(
              [...documents].map(([id, value]) => [
                id,
                {
                  source: value.source,
                  sha256: value.digest,
                  document: value.document,
                },
              ])
            ),
          });
          checkContext();
          for (const plan of missing) {
            const frame = fresh.get(plan.effectInstanceId);
            if (!frame) throw new Error('EFFECT_RUNTIME_GPU_FRAME_MISSING');
            const key = signatures.get(plan.effectInstanceId);
            if (key === null || key === undefined || !(frame.source instanceof ImageBitmap)) {
              views.set(plan.effectInstanceId, frame);
              transferred.add(frame);
              continue;
            }
            // Frozen metadata follows the existing entry lifetime and shares its bounded cache budget.
            const bytes =
              assertEffectRasterDimensions(frame.width, frame.height) * 4 +
              plan.documentSource.length * 2;
            while (
              entries.size >= EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedRasterEntries ||
              retainedBytes + bytes > EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedRasterBytes
            ) {
              const oldest = entries.keys().next().value;
              if (oldest === undefined) throw new Error('EFFECT_RUNTIME_GPU_FRAME_REUSE_BUDGET');
              retire(oldest);
            }
            retire(plan.effectInstanceId);
            identity ??= crypto.randomUUID();
            const entry: Entry = {
              frame,
              signature: key.key,
              document: key.document,
              source: plan.documentSource,
              digest: plan.documentSha256,
              bytes,
              readers: 0,
              retired: false,
              released: false,
              cache: { key: `effect-content:${identity}:${plan.effectInstanceId}`, revision: {} },
            };
            entries.set(plan.effectInstanceId, entry);
            retainedBytes += bytes;
            transferred.add(frame);
            views.set(plan.effectInstanceId, borrow(entry, plan));
          }
        }
        checkContext();
        return new Map(
          args.plans.map((plan) => {
            const frame = views.get(plan.effectInstanceId);
            if (!frame) throw new Error('EFFECT_RUNTIME_GPU_FRAME_MISSING');
            return [plan.effectInstanceId, frame];
          })
        );
      } catch (error) {
        for (const frame of views.values()) frame.dispose();
        for (const frame of fresh?.values() ?? []) if (!transferred.has(frame)) frame.dispose();
        throw error;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      lifetime.abort();
      clear();
    },
  };
}
