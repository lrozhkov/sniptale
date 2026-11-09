import type { VideoSample } from 'mediabunny';
import {
  prepareDecodedVideoSample,
  borrowDecodedSourceSample,
  decodedSampleFrameSource,
} from '../../../features/video/composition/draw/decoded-sample';
import {
  createPreviewSourceProvider,
  type PreviewSourceDemand,
} from '../../../workflows/video/preview-source';
import {
  createPreviewHtmlSourceProvider,
  type PreparedPreviewSourceLease,
} from '../../../workflows/video/preview-html-source';
import { getVideoClipSourceTime } from '../../../features/video/project/timeline';
import { getClipPlaybackOffset } from '../../../features/video/project/timeline/rate';
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
  readonly managesSources: boolean;
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
  createSourceProvider?: typeof createPreviewSourceProvider;
  createHtmlProvider?: typeof createPreviewHtmlSourceProvider;
  ownerDocument?: Document;
}): ProjectExportSourceSampling {
  const mode = parseEnhancementMode(args.settings.detailEnhancement);
  const managesSources = typeof VideoFrame !== 'undefined';
  let provider: ReturnType<typeof createPreviewSourceProvider> | undefined;
  let html: ReturnType<typeof createPreviewHtmlSourceProvider> | undefined;
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
  const acquireSources = async (input: Parameters<ProjectExportSourceSampling['prepare']>[0]) => {
    const signal = input.signal ?? new AbortController().signal;
    if (input.fallback) {
      samples ??= (args.createSamples ?? createCompositionCutSampleSource)({
        project: args.project,
        sourceUrl: args.sourceUrl,
        conversion: 'canvas',
      });
      const lease = await samples.sample(input.time, signal, input.fallback, input.project, [
        { frame: input.frame, time: input.time },
      ]);
      return {
        media: new Map([
          ...input.media,
          ...lease.forFrame(input.frame, input.time, [
            ...input.frame.visualLayers,
            ...input.frame.effectInputLayers,
          ]),
        ]),
        release: lease.release,
      };
    }
    const layers = [...input.frame.visualLayers, ...input.frame.effectInputLayers].flatMap(
      (layer) =>
        layer.kind === 'video'
          ? [layer]
          : layer.kind === 'effect' && layer.sourceAttachment
            ? [layer.sourceAttachment.owner]
            : []
    );
    const demands: PreviewSourceDemand[] = [];
    const ids = new Map<string, string>();
    for (const layer of layers) {
      if (ids.has(layer.clipId)) continue;
      const clip = layer.clip;
      const url = args.sourceUrl(clip);
      if (!url) throw new Error('Original export source is unavailable.');
      const time = getVideoClipSourceTime(clip, input.time);
      const offset = clip.cameraTiming?.offsetSeconds ?? 0;
      const rangeEnd = clip.sourceStart + clip.sourceDuration - offset;
      const held =
        clip.playbackWindow?.holdAt !== undefined &&
        getClipPlaybackOffset(clip, input.time) >= clip.playbackWindow.holdAt &&
        time === rangeEnd;
      const id = String(demands.length);
      ids.set(layer.clipId, id);
      demands.push({
        id,
        url,
        time,
        rangeStart: clip.sourceStart - offset,
        rangeEnd,
        ...(held ? { endpoint: 'retained-end' as const } : {}),
      });
    }
    if (!demands.length) return { media: input.media, release() {} };
    provider ??= (args.createSourceProvider ?? createPreviewSourceProvider)();
    let lease: PreparedPreviewSourceLease | null = await provider.acquire(demands, signal);
    if (!lease) {
      html ??= (args.createHtmlProvider ?? createPreviewHtmlSourceProvider)();
      lease = await html.acquire(demands, signal);
    }
    const acquired = lease;
    const owned: VideoSample[] = [];
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      for (const sample of owned) sample.close();
      acquired.release();
    };
    try {
      const media = new Map(input.media);
      for (const [clipId, id] of ids) {
        const binding = acquired.bindings.get(id);
        if (!binding?.source.toVideoFrame)
          throw new Error('Original export sample is unavailable.');
        const sample = await prepareDecodedVideoSample(
          borrowDecodedSourceSample(
            binding.source.toVideoFrame(),
            binding.timestamp,
            binding.source.orientation
          ),
          signal
        );
        owned.push(sample);
        signal.throwIfAborted();
        media.set(clipId, decodedSampleFrameSource(sample));
      }
      return { media, release };
    } catch (error) {
      release();
      throw error;
    }
  };
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
    if (mode === 'off' && !managesSources)
      return {
        media: input.media,
        sourceRasterScale: 1,
        rasterScaleForDemand: () => 1,
        effectMedia: () => input.media,
        forDemand: () => input.media,
        renderDimensions: (p) => p.renderDimensions,
        release() {},
      };
    const plans =
      mode === 'off'
        ? []
        : resolveNativeSourceSamplingDemands({ ...input, settings: args.settings });
    const rasterScaleForDemand = (id: string) =>
      Math.max(
        resolveProjectOutputTransform(input.project, args.settings).scale,
        ...plans.map((plan) => plan.captureScales.get(id) ?? 0)
      );
    const densityFor = (plan: EffectRuntimeFramePlan) =>
      Math.max(
        1,
        ...plans
          .filter((p) => nativeSamplingTargetIncludes(plan, p.clipId, input.frame))
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
    const magnified = mode !== 'off' && hasMagnificationDemand(plans.flatMap((p) => p.demands));
    const signal = input.signal ?? new AbortController().signal;
    let decoded: { media: ReadonlyMap<string, VideoCompositionMediaSource>; release(): void };
    if (managesSources) decoded = await acquireSources(input);
    else if (
      !magnified ||
      (input.time === (input.sceneTime ?? input.time) &&
        plans.every((plan) => isVideoCompositionFrameSource(input.media.get(plan.clipId))))
    )
      decoded = { media: input.media, release() {} };
    else {
      samples ??= (args.createSamples ?? createCompositionCutSampleSource)({
        project: args.project,
        sourceUrl: args.sourceUrl,
        conversion: 'native',
      });
      decoded = await samples.sample(input.time, signal, input.fallback ?? 'first', input.project);
    }
    if (!magnified) {
      try {
        signal.throwIfAborted();
        if (disposed) throw new Error('Export sampling is disposed.');
      } catch (error) {
        decoded.release();
        throw error;
      }
      const media = resourceMedia(decoded.media);
      let released = false;
      const pass: NativePreparedSourcePass = {
        media,
        sourceRasterScale: mode === 'off' ? 1 : rasterScaleForDemand('body'),
        rasterScaleForDemand: mode === 'off' ? () => 1 : rasterScaleForDemand,
        effectMedia: () => media,
        forDemand: () => media,
        renderDimensions: mode === 'off' ? (p) => p.renderDimensions : physical,
        release() {
          if (released) return;
          released = true;
          if (current === pass) {
            current = undefined;
            key = undefined;
          }
          decoded.release();
        },
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
      enhancer ??= createExportEnhancer({
        mode,
        ...(args.ownerDocument ? { document: args.ownerDocument } : {}),
      });
      const media = resourceMedia(decoded.media);
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
            physicalSource: plan.demands[0]!.sourceKey,
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
          return nativeSamplingTargetIncludes(plan, plans[0]?.clipId ?? '', input.frame) ||
            plans.some((p) => nativeSamplingTargetIncludes(plan, p.clipId, input.frame))
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
    managesSources,
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
      try {
        await enhancer?.dispose();
      } finally {
        current?.release();
        current = undefined;
        for (const lease of [...scratch]) lease.release();
        for (const release of [...byteLeases]) release();
        samples?.dispose();
        provider?.dispose();
        html?.dispose();
      }
    },
  };
}
