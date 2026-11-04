import type {
  RenderResources,
  RenderCanvasLease,
} from '../../../features/video/composition/canvas/render-resources';
import {
  createExportEnhancer,
  type ExportEnhancer,
} from '../../../features/video/composition/export-enhancement/enhancer';
import { parseEnhancementMode } from '../../../features/video/composition/export-enhancement/mode';
import {
  createPreparedSourceBudget,
  hasMagnificationDemand,
  prepareSourceSampling,
  type PreparedSourceBudget,
} from '../../../features/video/composition/export-enhancement/prepared-source';
import {
  isVideoCompositionFrameSource,
  type VideoCompositionMediaSource,
  type VideoCompositionFrameSource,
} from '../../../features/video/composition/draw/media-source';
import type { VideoCompositionFrame } from '../../../features/video/composition/types';
import type { EffectRuntimeFramePlan } from '../../../features/video/composition/effect-runtime/runtime/types';
import { assertEffectDecodedRaster } from '../../../features/video/composition/effect-runtime/runtime/resource-limits';
import { resolveProjectOutputTransform } from '../../../features/video/project/export/output-dimensions';
import type {
  VideoProject,
  VideoProjectExportSettings,
  VideoProjectVideoClip,
} from '../../../features/video/project/types';
import { createCompositionCutSampleSource } from '../../../workflows/video-review/decoded-video-sample';
import {
  resolveNativeSourceSamplingDemands,
  nativeSamplingTargetIncludes,
  type NativeSamplingSourcePlan,
} from './source-sampling-plan';

interface NativePreparedSourcePass {
  media: ReadonlyMap<string, VideoCompositionMediaSource>;
  sourceRasterScale: number;
  rasterScaleForDemand(id: string): number;
  effectMedia(plan: EffectRuntimeFramePlan): ReadonlyMap<string, VideoCompositionMediaSource>;
  forDemand(id: string): ReadonlyMap<string, VideoCompositionMediaSource>;
  renderDimensions(plan: EffectRuntimeFramePlan): { width: number; height: number };
  release(): void;
}
export interface ProjectExportSourceSampling {
  prepare(args: {
    project: VideoProject;
    frame: VideoCompositionFrame;
    time: number;
    sceneTime?: number;
    fallback?: 'first' | 'last';
    media: ReadonlyMap<string, VideoCompositionMediaSource>;
    images?: Record<string, HTMLImageElement>;
    lensFrame?: VideoCompositionFrame;
    signal?: AbortSignal;
  }): Promise<NativePreparedSourcePass>;
  reserveRaster(width: number, height: number): () => void;
  releasePass(): void;
  dispose(): Promise<void>;
}
function normalizeOriginalSourceRaster(
  source: VideoCompositionFrameSource,
  frame: VideoFrame,
  size: { width: number; height: number },
  budget: PreparedSourceBudget,
  ownerDocument?: Document
): { raw: CanvasImageSource; release(): void } {
  if (
    !source.orientation?.rotation &&
    !source.orientation?.flip &&
    frame.displayWidth === size.width &&
    frame.displayHeight === size.height
  )
    return { raw: frame, release() {} };
  const releaseRaster = budget.reserve(size.width, size.height);
  let canvas: HTMLCanvasElement | undefined;
  try {
    canvas = (ownerDocument ?? document).createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Original oriented source surface is unavailable.');
    source.draw(context, 0, 0, size.width, size.height);
    const image = canvas;
    let released = false;
    return {
      raw: image,
      release() {
        if (released) return;
        released = true;
        image.width = image.height = 0;
        releaseRaster();
      },
    };
  } catch (error) {
    if (canvas) canvas.width = canvas.height = 0;
    releaseRaster();
    throw error;
  }
}

function scopePreparedSourceMedia(
  media: ReadonlyMap<string, VideoCompositionMediaSource>,
  originalMedia: ReadonlyMap<string, VideoCompositionMediaSource>,
  plans: readonly NativeSamplingSourcePlan[],
  id: string,
  withResources: (source: VideoCompositionMediaSource) => VideoCompositionMediaSource
): ReadonlyMap<string, VideoCompositionMediaSource> {
  const selected = new Map(media);
  for (const plan of plans) {
    const source = media.get(plan.clipId);
    const original = originalMedia.get(plan.clipId);
    if (!source || !isVideoCompositionFrameSource(source) || !source.preparedSampling) continue;
    const sampling = source.preparedSampling;
    if (!plan.demands.some((d) => d.id === id)) {
      if (original) selected.set(plan.clipId, withResources(original));
      continue;
    }
    selected.set(plan.clipId, {
      ...source,
      preparedSampling: {
        ...sampling,
        drawPrepared: (requested, context, roi, destination) =>
          sampling.drawPrepared(
            requested === 'body' ? id : `${id}/${requested}`,
            context,
            roi,
            destination
          ),
        visitPreparedTiles: (requested, consume) =>
          sampling.visitPreparedTiles(requested === 'body' ? id : `${id}/${requested}`, consume),
      },
    });
  }
  return selected;
}

/** One job owns the enhancer and decoder inputs; one pass owns every prepared source tile. */
export function createProjectExportSourceSampling(args: {
  project: VideoProject;
  settings: VideoProjectExportSettings;
  sourceUrl(clip: VideoProjectVideoClip): string | undefined;
  enhancer?: ExportEnhancer;
  createSamples?: typeof createCompositionCutSampleSource;
  ownerDocument?: Document;
}): ProjectExportSourceSampling {
  const mode = parseEnhancementMode(args.settings.detailEnhancement);
  let enhancer: ExportEnhancer | undefined = args.enhancer;
  let samples: ReturnType<typeof createCompositionCutSampleSource> | undefined;
  let current: NativePreparedSourcePass | undefined;
  let key:
    | {
        time: number;
        frame: VideoCompositionFrame;
        lensFrame: VideoCompositionFrame | undefined;
        sceneTime: number | undefined;
        fallback: 'first' | 'last' | undefined;
        project: VideoProject;
        media: ReadonlyMap<string, VideoCompositionMediaSource>;
      }
    | undefined;
  let active: Promise<NativePreparedSourcePass> | undefined;
  let disposed = false;
  const budget = createPreparedSourceBudget();
  const scratch = new Set<RenderCanvasLease>();
  const byteLeases = new Set<() => void>();
  const renderResources: RenderResources = {
    canvas(_role, size, options) {
      const releaseBudget = budget.reserve(size.width, size.height);
      let canvas: HTMLCanvasElement | undefined;
      try {
        canvas = (args.ownerDocument ?? document).createElement('canvas');
        canvas.width = size.width;
        canvas.height = size.height;
        const context = canvas.getContext('2d', options);
        if (!context) throw new Error('Export source scratch surface is unavailable.');
        let released = false;
        const image = canvas;
        const lease: RenderCanvasLease = {
          canvas: image,
          context,
          release() {
            if (released) return;
            released = true;
            image.width = image.height = 0;
            scratch.delete(lease);
            releaseBudget();
          },
        };
        scratch.add(lease);
        return lease;
      } catch (error) {
        if (canvas) canvas.width = canvas.height = 0;
        releaseBudget();
        throw error;
      }
    },
    bytes(_role, count) {
      const releaseBudget = budget.reserveBytes(count);
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        byteLeases.delete(release);
        releaseBudget();
      };
      byteLeases.add(release);
      return { release };
    },
  };
  const withResources = (source: VideoCompositionMediaSource): VideoCompositionMediaSource => {
    if (isVideoCompositionFrameSource(source)) return { ...source, renderResources };
    if (typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement)
      return {
        sourceWidth: source.videoWidth,
        sourceHeight: source.videoHeight,
        renderResources,
        draw: (context, x, y, width, height) => context.drawImage(source, x, y, width, height),
      };
    return source;
  };
  const resourceMedia = (media: ReadonlyMap<string, VideoCompositionMediaSource>) =>
    new Map([...media].map(([id, source]) => [id, withResources(source)]));
  const prepare = async (
    input: Parameters<ProjectExportSourceSampling['prepare']>[0]
  ): Promise<NativePreparedSourcePass> => {
    if (disposed) throw new Error('Export sampling is disposed.');
    input.signal?.throwIfAborted();
    if (
      current &&
      key?.time === input.time &&
      key.frame === input.frame &&
      key.lensFrame === input.lensFrame &&
      key.sceneTime === input.sceneTime &&
      key.fallback === input.fallback &&
      key.project === input.project &&
      key.media === input.media
    )
      return current;
    current?.release();
    current = undefined;
    key = undefined;
    if (mode === 'off')
      return {
        media: input.media,
        sourceRasterScale: 1,
        rasterScaleForDemand: () => 1,
        effectMedia: () => input.media,
        forDemand: () => input.media,
        renderDimensions: (p) => p.renderDimensions,
        release() {},
      };
    const plans = resolveNativeSourceSamplingDemands({ ...input, settings: args.settings });
    const rasterScaleForDemand = (id: string) =>
      Math.max(
        resolveProjectOutputTransform(input.project, args.settings).scale,
        ...plans.map((plan) => plan.captureScales.get(id) ?? 0)
      );
    const densityFor = (plan: EffectRuntimeFramePlan) =>
      Math.max(
        1,
        ...plans
          .filter((p) => nativeSamplingTargetIncludes(plan, p.clipId))
          .map((p) => p.sourceRasterScale)
      );
    const physical = (plan: EffectRuntimeFramePlan) => {
      const density = densityFor(plan);
      const extent = {
        width: Math.max(plan.renderDimensions.width, Math.ceil(plan.dimensions.width * density)),
        height: Math.max(plan.renderDimensions.height, Math.ceil(plan.dimensions.height * density)),
      };
      assertEffectDecodedRaster(extent.width, extent.height);
      return extent;
    };
    // Refuse an impossible FX output before starting source inference.
    for (const plan of input.frame.effectRuntimePlans ?? []) physical(plan);
    if (!hasMagnificationDemand(plans.flatMap((p) => p.demands)))
      return {
        media: resourceMedia(input.media),
        sourceRasterScale: rasterScaleForDemand('body'),
        rasterScaleForDemand,
        effectMedia: () => resourceMedia(input.media),
        forDemand: () => resourceMedia(input.media),
        renderDimensions: physical,
        release() {},
      };
    enhancer ??= createExportEnhancer({
      mode,
      ...(args.ownerDocument ? { document: args.ownerDocument } : {}),
    });
    const signal = input.signal ?? new AbortController().signal;
    const retained =
      input.time === (input.sceneTime ?? input.time) &&
      plans.every((plan) => isVideoCompositionFrameSource(input.media.get(plan.clipId)));
    let decoded: { media: ReadonlyMap<string, VideoCompositionMediaSource>; release(): void };
    if (retained) decoded = { media: input.media, release() {} };
    else {
      samples ??= (args.createSamples ?? createCompositionCutSampleSource)({
        project: args.project,
        sourceUrl: args.sourceUrl,
        conversion: 'native',
      });
      // A retained sample at/before the requested clock is used first. If none lies in the active
      // retained range, ordinary sampling takes its first frame; held-last remains reader-owned.
      decoded = await samples.sample(input.time, signal, input.fallback ?? 'first', input.project);
    }
    const leases: Array<{ dispose(): void }> = [];
    const owned: VideoFrame[] = [];
    const normalized: Array<{ release(): void }> = [];
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      if (current?.release === release) {
        current = undefined;
        key = undefined;
      }
      for (const lease of leases) lease.dispose();
      for (const raster of normalized) {
        raster.release();
      }
      for (const frame of owned) frame.close();
      decoded.release();
    };
    try {
      const media = resourceMedia(input.media);
      for (const plan of plans) {
        if (!plan.demands.length) continue;
        const source = decoded.media.get(plan.clipId);
        if (!source || !isVideoCompositionFrameSource(source) || !source.toVideoFrame)
          throw new Error('Original export sample is unavailable.');
        if (
          source.sourceWidth !== plan.sourceSize.width ||
          source.sourceHeight !== plan.sourceSize.height
        )
          throw new Error('Original export display dimensions changed.');
        const frame = source.toVideoFrame();
        owned.push(frame);
        const raster = normalizeOriginalSourceRaster(
          source,
          frame,
          plan.sourceSize,
          budget,
          args.ownerDocument
        );
        normalized.push(raster);
        const identity = {
          sourceKey: {
            clipId: plan.clipId,
            sampleTimestamp: frame.timestamp,
            orientation: source.orientation,
          },
          sourceTime: plan.demands[0]!.sourceTime,
          passTime: input.time,
          sourceSize: plan.sourceSize,
        };
        const lease = await prepareSourceSampling({
          enhancer,
          budget,
          identity,
          source: raster.raw,
          demands: plan.demands.map((demand) => ({ ...demand, sourceKey: identity.sourceKey })),
          signal,
          ...(args.ownerDocument ? { document: args.ownerDocument } : {}),
        });
        leases.push(lease);
        const body = plan.demands.some((d) => d.id === 'body');
        media.set(plan.clipId, {
          ...source,
          renderResources,
          preparedSampling: body
            ? lease.sampling
            : {
                ...lease.sampling,
                visitPreparedTiles: (id, consume) =>
                  id === 'body' ? false : lease.sampling.visitPreparedTiles(id, consume),
                drawPrepared: (id, context, roi, destination) =>
                  id === 'body'
                    ? false
                    : lease.sampling.drawPrepared(id, context, roi, destination),
              },
        });
      }
      signal.throwIfAborted();
      if (disposed) throw new Error('Export sampling is disposed.');
      const pass: NativePreparedSourcePass = {
        media,
        sourceRasterScale: rasterScaleForDemand('body'),
        rasterScaleForDemand,
        effectMedia(plan) {
          return nativeSamplingTargetIncludes(plan, plans[0]?.clipId ?? '') ||
            plans.some((p) => nativeSamplingTargetIncludes(plan, p.clipId))
            ? this.forDemand('effectInput')
            : media;
        },
        forDemand(id) {
          return scopePreparedSourceMedia(media, decoded.media, plans, id, withResources);
        },
        renderDimensions: physical,
        release,
      };
      current = pass;
      key = {
        time: input.time,
        frame: input.frame,
        lensFrame: input.lensFrame,
        sceneTime: input.sceneTime,
        fallback: input.fallback,
        project: input.project,
        media: input.media,
      };
      return pass;
    } catch (error) {
      release();
      throw error;
    }
  };
  return {
    prepare(input) {
      if (active) return Promise.reject(new Error('Export sampling is busy.'));
      const pending = prepare(input);
      active = pending;
      void pending
        .finally(() => {
          if (active === pending) active = undefined;
        })
        .catch(() => {});
      return pending;
    },
    reserveRaster: (width, height) => budget.reserve(width, height),
    releasePass() {
      current?.release();
      current = undefined;
      key = undefined;
    },
    async dispose() {
      disposed = true;
      try {
        await active;
      } catch {
        // The frame caller receives the failure; teardown must still drain and release the source.
      }
      await enhancer?.dispose();
      current?.release();
      current = undefined;
      for (const lease of [...scratch]) lease.release();
      for (const release of [...byteLeases]) release();
      samples?.dispose();
    },
  };
}
