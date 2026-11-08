import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  createPreviewSourceProvider,
  PreviewSourceSupersededError,
  type PreviewSourceAcquireOptions,
  type PreviewSourceDemand,
  type PreviewSourceLease,
  type PreviewSourceProvider,
} from '../../../../workflows/video/preview-source';
import { getVideoClipSourceTime, isVideoClip } from '../../../../features/video/project/timeline';
import type { VideoProject } from '../../../../features/video/project/types';
import { resolveActivePreviewClips } from '../runtime/index';

/** One immutable Native request context borrows the mounted source provider. */
export interface NativePreviewSourceRuntime {
  readonly selected: boolean;
  acquire(
    demands: readonly PreviewSourceDemand[],
    signal: AbortSignal,
    options?: PreviewSourceAcquireOptions
  ): Promise<PreviewSourceLease | null>;
  prepare(time: number, signal: AbortSignal): Promise<'ready' | 'retry'>;
}

interface SourceContext {
  project: VideoProject;
  assetUrls: Record<string, string>;
  key: string;
  selected: boolean;
  mountGeneration: number;
}

function staleSourceRequest(): DOMException {
  return new DOMException('Preview source request was replaced.', 'AbortError');
}

function nominalSourceDemands(context: SourceContext, time: number): PreviewSourceDemand[] | null {
  const demands: PreviewSourceDemand[] = [];
  for (const clip of resolveActivePreviewClips(context.project, time)) {
    if (!isVideoClip(clip)) continue;
    const url = context.assetUrls[clip.assetId];
    if (!url) return null;
    const offset = clip.cameraTiming?.offsetSeconds ?? 0;
    demands.push({
      id: clip.id,
      url,
      time: getVideoClipSourceTime(clip, time),
      rangeStart: clip.sourceStart - offset,
      rangeEnd: clip.sourceStart + clip.sourceDuration - offset,
    });
  }
  return demands;
}

type SourceReadiness = { kind: 'ready' | 'unsupported' } | { kind: 'failed'; error: unknown };
interface SceneSourceInterest {
  context: SourceContext;
  demands: readonly PreviewSourceDemand[];
  signal: AbortSignal;
  outcome: Promise<SourceReadiness>;
}
interface SourceReadinessInterest {
  context: SourceContext;
  demands: readonly PreviewSourceDemand[];
  signal: AbortSignal;
  handoff?: SceneSourceInterest;
}
function matchingSourceInterest(
  scene: SceneSourceInterest | undefined,
  readiness: SourceReadinessInterest
): scene is SceneSourceInterest {
  return (
    !!scene &&
    scene.context === readiness.context &&
    !scene.signal.aborted &&
    readiness.demands.every((demand) =>
      scene.demands.some((other) => other.url === demand.url && other.time === demand.time)
    )
  );
}
/** A readiness observer cancels only its own wait, never the Scene lease or request. */
function awaitSourceReadiness(
  outcome: Promise<SourceReadiness>,
  signal: AbortSignal
): Promise<SourceReadiness> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      cleanup();
      reject(signal.reason);
    };
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    void outcome.then((value) => {
      cleanup();
      resolve(value);
    });
  });
}
/** Coordinate just the mounted Scene and playback readiness interests over the existing core queue. */
function createNativeSourceReadiness(
  isCurrent: (context: SourceContext) => boolean,
  acquire: (
    context: SourceContext,
    demands: readonly PreviewSourceDemand[],
    signal: AbortSignal,
    options?: PreviewSourceAcquireOptions
  ) => Promise<PreviewSourceLease | null>
) {
  let scene: SceneSourceInterest | undefined;
  let readiness: SourceReadinessInterest | undefined;
  return {
    async scene(
      context: SourceContext,
      demands: readonly PreviewSourceDemand[],
      signal: AbortSignal,
      options?: PreviewSourceAcquireOptions
    ) {
      signal.throwIfAborted();
      if (!isCurrent(context)) throw staleSourceRequest();
      const outcome = Promise.withResolvers<SourceReadiness>();
      const interest: SceneSourceInterest = {
        context,
        demands: demands.map((demand) => ({ ...demand })),
        signal,
        outcome: outcome.promise,
      };
      if (readiness && !readiness.signal.aborted && matchingSourceInterest(interest, readiness))
        readiness.handoff = interest;
      scene = interest;
      const result = acquire(context, demands, signal, options);
      void result
        .then(
          (lease) => outcome.resolve({ kind: lease ? 'ready' : 'unsupported' }),
          (error) => outcome.resolve({ kind: 'failed', error })
        )
        .finally(() => {
          if (scene === interest) scene = undefined;
        });
      return result;
    },
    async prepare(
      context: SourceContext,
      demands: readonly PreviewSourceDemand[],
      signal: AbortSignal
    ): Promise<'ready' | 'retry'> {
      signal.throwIfAborted();
      if (!demands.length) return 'ready';
      const interest: SourceReadinessInterest = { context, demands, signal };
      readiness = interest;
      try {
        if (matchingSourceInterest(scene, interest)) {
          const result = await awaitSourceReadiness(scene.outcome, signal);
          if (result.kind === 'failed') throw result.error;
          if (result.kind === 'unsupported') return 'retry';
          signal.throwIfAborted();
          if (!isCurrent(context)) throw staleSourceRequest();
        } else {
          const lease = await acquire(context, demands, signal, { discontinuity: true });
          if (!lease) return 'retry';
          lease.release();
        }
        return 'ready';
      } catch (error) {
        // Only the core queue's known replacement, with a live matching Scene, permits retry.
        if (
          error instanceof PreviewSourceSupersededError &&
          !signal.aborted &&
          isCurrent(context) &&
          matchingSourceInterest(interest.handoff, interest)
        )
          return 'retry';
        throw error;
      } finally {
        if (readiness === interest) readiness = undefined;
      }
    },
  };
}

function createNativeSourceOwner(unsupported: (key: string) => void) {
  let active = true;
  let mountedBefore = false;
  let current: SourceContext | undefined;
  let bound: SourceContext | undefined;
  let unsupportedKey: string | undefined;
  let provider: { projectId: string; value: PreviewSourceProvider } | undefined;
  const retire = () => {
    const previous = provider;
    provider = undefined;
    previous?.value.dispose();
  };
  const isCurrent = (context: SourceContext) => active && current === context;
  const acquire = async (
    context: SourceContext,
    demands: readonly PreviewSourceDemand[],
    signal: AbortSignal,
    options?: PreviewSourceAcquireOptions
  ) => {
    signal.throwIfAborted();
    if (!isCurrent(context)) throw staleSourceRequest();
    if (!context.selected || unsupportedKey === context.key) return null;
    if (provider && provider.projectId !== context.project.id) retire();
    provider ??= { projectId: context.project.id, value: createPreviewSourceProvider() };
    provider.value.retainSources(new Set(Object.values(context.assetUrls)));
    const lease = await provider.value.acquire(demands, signal, options);
    if (!isCurrent(context) || signal.aborted) {
      lease?.release();
      signal.throwIfAborted();
      throw staleSourceRequest();
    }
    if (!lease) {
      unsupportedKey = context.key;
      unsupported(context.key);
    }
    return lease;
  };
  const coordination = createNativeSourceReadiness(isCurrent, acquire);
  return {
    bind(context: SourceContext): NativePreviewSourceRuntime {
      bound = current = context;
      return {
        selected: context.selected,
        acquire: (demands, signal, options) =>
          coordination.scene(context, demands, signal, options),
        async prepare(time, signal) {
          signal.throwIfAborted();
          if (!isCurrent(context)) return 'retry';
          if (!context.selected) return 'ready';
          if (unsupportedKey === context.key) return 'retry';
          const demands = nominalSourceDemands(context, time);
          if (!demands) return 'retry';
          return coordination.prepare(context, demands, signal);
        },
      };
    },
    mount() {
      const remount = mountedBefore;
      mountedBefore = active = true;
      current = bound;
      return remount;
    },
    suspend(context: SourceContext) {
      if (!isCurrent(context)) return;
      if (!context.selected || provider?.projectId !== context.project.id) retire();
      else provider.value.retainSources(new Set(Object.values(context.assetUrls)));
    },
    dispose() {
      active = false;
      current = undefined;
      retire();
    },
  };
}

/** Source-only takeover never changes the existing audio or project clock authority. */
export function useNativePreviewSourceRuntime(params: {
  project: VideoProject;
  assetUrls: Record<string, string>;
  enabled: boolean;
  retryVersion: number;
}): NativePreviewSourceRuntime {
  const [unsupportedKey, setUnsupportedKey] = useState<string>();
  const [mountGeneration, refreshMount] = useReducer((value: number) => value + 1, 0);
  const ownerRef = useRef<ReturnType<typeof createNativeSourceOwner> | null>(null);
  ownerRef.current ??= createNativeSourceOwner(setUnsupportedKey);
  const owner = ownerRef.current;
  const sourceKey = useMemo(
    () =>
      JSON.stringify([
        params.project.id,
        params.retryVersion,
        Object.entries(params.assetUrls).sort(),
      ]),
    [params.project.id, params.assetUrls, params.retryVersion]
  );
  const capable = typeof VideoDecoder !== 'undefined' && typeof VideoFrame !== 'undefined';
  const context = useMemo<SourceContext>(
    () => ({
      project: params.project,
      assetUrls: params.assetUrls,
      key: sourceKey,
      selected: params.enabled && capable && unsupportedKey !== sourceKey,
      mountGeneration,
    }),
    [
      params.project,
      params.assetUrls,
      params.enabled,
      capable,
      sourceKey,
      unsupportedKey,
      mountGeneration,
    ]
  );
  const runtime = useMemo(() => owner.bind(context), [owner, context]);
  useEffect(() => {
    if (owner.mount()) refreshMount();
    return () => owner.dispose();
  }, [owner]);
  useEffect(() => owner.suspend(context), [owner, context]);
  return runtime;
}
