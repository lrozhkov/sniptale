import type { VideoCompositionFrameSource } from '../../features/video/composition/draw/media-source';
import {
  reviewGpuAnnotationLayer,
  reviewGpuAnnotationGroup,
  reviewGpuAnnotationDensity,
} from './gpu-preview-annotations';
import { prepareEffectRuntimeGpuScene } from '../../features/video/composition/effect-runtime/render/gpu-plan';
import { createRetainedRasterMaterialOwner } from '../../features/video/composition/canvas/retained-raster-material';
import type { PreviewGpuCanvasFactory, PreviewGpuCanvasLease } from './preview-render-resources';
import { buildReviewGpuScene, reviewGpuStaticBackgroundDrift } from './gpu-preview-scene';
import type { PreviewRendererStatus } from '../../features/video/preview/preferences';
import {
  reviewGpuArtworkGeometry,
  reviewPresentedGeometry,
  type ReviewPresentedGeometry,
} from './gpu-preview-geometry';
import {
  createGpuPreviewRenderer,
  GpuPreviewDeviceError,
  type GpuPreviewGroup,
  type GpuPreviewLayer,
  type GpuPreviewRenderer,
} from '../../features/video/composition/canvas/gpu-preview';
import type {
  RenderCanvasLease,
  RenderResources,
} from '../../features/video/composition/canvas/render-resources';
import type { QuickEditHomography } from '../../features/video/composition/motion/spatial-geometry';
import { computeQuickEditSceneLayout } from '../../features/video/review/advanced/scene';
import type { QuickEditCameraTransform } from '../../features/video/review/advanced/types';
import { hasSceneBackgroundMotion } from '../../features/video/project/scene/background-motion';
import { drawReviewSceneShadow } from './scene-shadow';
import type { PreviewScene, PreviewSceneDimensions } from './preview-scene';
import type { prepareReviewCaptions } from './render-captions';
import { createReviewBackgroundPainter } from './scene-background';
import {
  createReviewGpuPrimitives,
  reviewGpuFinishLayers,
  type reviewGpuContentLayers,
  type ReviewGpuCamera,
} from './gpu-preview-layers';
import {
  reviewCutTransitionSides,
  type ReviewTransitionFrames,
  type ReviewTransitionSample,
} from './cut-transition-frames';
import type { reviewCutTransitionAt } from '../../features/video/review/cuts';

interface ReviewGpuRenderInput {
  scene: PreviewScene;
  dimensions: Dimensions;
  geometry: ReviewPresentedGeometry;
  frame: VideoFrame;
  orientation?: VideoCompositionFrameSource['orientation'];
  sourceTime: number;
  context: CanvasRenderingContext2D;
  header: ImageBitmap | null;
  image: ImageBitmap | null;
  painter: ReturnType<typeof createReviewBackgroundPainter>;
  captions: Captions | null;
  signal: AbortSignal;
  fps?: number;
  camera?: ReviewGpuCamera;
  annotations?: Parameters<typeof reviewGpuContentLayers>[0]['annotations'];
  watermark?: Parameters<typeof reviewGpuFinishLayers>[0]['watermark'];
  admit?(bitmaps: readonly { width: number; height: number }[]): void;
  sceneAt?(resultTime: number, sourceTime: number): Promise<PreviewScene>;
  cameraOverride?: QuickEditCameraTransform;
  transition?: {
    blend: NonNullable<ReturnType<typeof reviewCutTransitionAt>>;
    frames: ReviewTransitionFrames;
    resultOffset?: number;
  };
}
type ReviewGpuSceneInput = Omit<ReviewGpuRenderInput, 'context'>;
type ReviewGpuPresentationInput = ReviewGpuSceneInput & { acquireOutput: PreviewGpuCanvasFactory };
type BitmapOutput = { kind: 'bitmap'; context: CanvasRenderingContext2D };
type PresentationOutput = { kind: 'presentation'; acquireOutput: PreviewGpuCanvasFactory };

/** Completed pixels retain their backend until publication releases this receipt. */
export interface ReviewGpuPresentedFrame {
  canvas: HTMLCanvasElement;
  release(): void;
  outputKind: 'gpu-surface';
  retainedProviderBytes(): number;
  isRetiredProvider(): boolean;
}

const identity: QuickEditHomography = [1, 0, 0, 0, 1, 0, 0, 0, 1];
type Captions = Awaited<ReturnType<typeof prepareReviewCaptions>>;
type Dimensions = PreviewSceneDimensions;

/** Request-owned artwork permits authored camera and overlay motion between pending frames. */
export function reviewGpuPreviewConcurrency(
  scene: PreviewScene,
  annotationMaximumInFlight: 1 | 2 = 1
): 1 | 2 {
  const plan = scene.outerFadePlan;
  return scene.webcam?.enabled ||
    scene.captions?.settings?.enabled ||
    (annotationMaximumInFlight !== 2 &&
      scene.annotationEffects?.lane.enabled &&
      scene.annotationEffects.lane.instances.some((instance) => instance.enabled)) ||
    (plan &&
      (plan.segments.some(
        (segment) => segment.name !== 'main' || segment.content.kind !== 'main'
      ) ||
        (plan.joins?.length ?? 0) > 0))
    ? 1
    : 2;
}

/** One Gallery preview session owns its GPU resources and failure fallback. */
export function createReviewGpuPreview(args: {
  resources: RenderResources;
  reserve(bytes: number): { release(): void };
  maximumInFlight?: 1 | 2;
}) {
  let renderer: GpuPreviewRenderer | null = null;
  let initialization: Promise<GpuPreviewRenderer | null> | null = null;
  let disabled = false;
  let fallbackReason: PreviewRendererStatus['fallback'];
  let disposed = false;
  let active = 0;
  let publicationHolds = 0;
  const failedProviders = new WeakSet<GpuPreviewRenderer>();
  let activeScene: PreviewScene | null = null;
  let activeDimensions: Dimensions | null = null;
  let activePainter: ReturnType<typeof createReviewBackgroundPainter> | null = null;
  let activeHeader: ImageBitmap | null = null;
  let activeImage: ImageBitmap | null = null;
  let activeWatermark: Parameters<typeof reviewGpuFinishLayers>[0]['watermark'] | undefined;
  let overlapSafe = false;
  let sceneReleased = false;
  let artworkRevision = 0;
  let coverage = createRetainedRasterMaterialOwner<HTMLCanvasElement>();
  const lifetime = new AbortController();
  let sceneLifetime = new AbortController();
  type Artwork = {
    painter: ReturnType<typeof createReviewBackgroundPainter>;
    background: RenderCanvasLease;
    decoration: RenderCanvasLease;
    overlay: RenderCanvasLease;
    rect: { x: number; y: number; width: number; height: number };
    key: string;
    backgroundRevision: number;
    image: ImageBitmap | null;
    captionKey: string;
    captionOwner: Captions | null;
    captionRevision: number;
  };
  const slots: { active: boolean; artwork: Artwork | null }[] = Array.from(
    { length: args.maximumInFlight ?? 1 },
    () => ({ active: false, artwork: null })
  );
  const clearSlot = (slot: (typeof slots)[number]) => {
    slot.artwork?.painter.dispose();
    slot.artwork?.background.release();
    slot.artwork?.decoration.release();
    slot.artwork?.overlay.release();
    slot.artwork = null;
  };
  const clear = () => {
    coverage.dispose();
    coverage = createRetainedRasterMaterialOwner<HTMLCanvasElement>();
    for (const slot of slots) clearSlot(slot);
    sceneReleased = false;
  };
  const disposeRetiredRenderer = () => {
    if (!disposed || active || publicationHolds) return;
    const provider = renderer;
    renderer = null;
    provider?.dispose();
  };
  const warmUpcoming = (input: ReviewGpuSceneInput, provider: GpuPreviewRenderer) => {
    if (!provider.preparePipelines || !input.annotations || input.signal.aborted || disposed)
      return;
    try {
      input.annotations.warmUpcomingGpu({
        time: input.geometry.resultTime,
        fps: input.fps ?? 30,
        ...(input.scene.annotationEffects
          ? { instances: input.scene.annotationEffects.lane.instances }
          : {}),
        context: provider,
        inputs: [input.scene, input.dimensions],
        signal: sceneLifetime.signal,
        densityAt(time) {
          const future = reviewPresentedGeometry(input.scene, input.dimensions, time);
          return reviewGpuAnnotationDensity(
            input.scene.source,
            input.dimensions,
            future.layout.videoTransform
          );
        },
        prepare(entry, time) {
          const future = reviewPresentedGeometry(input.scene, input.dimensions, time);
          const base = computeQuickEditSceneLayout({
            ...input.scene,
            output: input.dimensions.canonical,
            camera: { scale: 1, centerX: 0.5, centerY: 0.5 },
          });
          const marker = new OffscreenCanvas(1, 1);
          let reservation: { release(): void } | undefined;
          try {
            reservation = args.resources.bytes('annotation-warm-coverage', 4);
            const full = { x: 0, y: 0, ...input.dimensions.canonical };
            const annotation =
              entry.instance.attachment === 'content'
                ? reviewGpuAnnotationGroup(
                    [entry],
                    base.videoRect,
                    input.dimensions.canonical,
                    future.inverse,
                    { source: marker }
                  )
                : reviewGpuAnnotationLayer(entry, full, entry.source);
            // Real annotations follow scene content. Keep their non-leading group topology without future media.
            return provider.preparePipelines!({
              output: input.dimensions.backing,
              logical: input.dimensions.canonical,
              layers: [
                {
                  source: marker,
                  rect: { x: 0, y: 0, width: 1, height: 1 },
                  inverse: [1, 0, 0, 0, 1, 0, 0, 0, 1],
                },
                annotation,
              ],
              signal: sceneLifetime.signal,
            });
          } finally {
            marker.width = 0;
            marker.height = 0;
            reservation?.release();
          }
        },
      });
    } catch {
      // Preparation is advisory; foreground publication already succeeded.
    }
  };
  function execute(input: ReviewGpuSceneInput, output: BitmapOutput): Promise<boolean>;
  function execute(
    input: ReviewGpuSceneInput,
    output: PresentationOutput
  ): Promise<false | ReviewGpuPresentedFrame>;
  async function execute(
    input: ReviewGpuSceneInput,
    output: BitmapOutput | PresentationOutput
  ): Promise<boolean | ReviewGpuPresentedFrame> {
    if (disabled || disposed) return false;
    const { scene, dimensions, geometry } = input;
    const safe =
      reviewGpuPreviewConcurrency(scene, input.annotations?.maximumInFlight) === 2 &&
      !input.camera &&
      !input.transition &&
      !input.cameraOverride &&
      !input.captions &&
      (!input.annotations || input.annotations.maximumInFlight === 2);
    if (
      active &&
      (active >= (args.maximumInFlight ?? 1) ||
        sceneReleased ||
        !overlapSafe ||
        !safe ||
        activeScene !== scene ||
        activeDimensions !== dimensions ||
        activePainter !== input.painter ||
        activeHeader !== input.header ||
        activeImage !== input.image ||
        activeWatermark !== input.watermark)
    )
      throw new Error('GPU preview overlap is unavailable.');
    if (!active) {
      activeScene = scene;
      activeDimensions = dimensions;
      activePainter = input.painter;
      activeHeader = input.header;
      activeImage = input.image;
      activeWatermark = input.watermark;
      overlapSafe = safe;
    }
    const slot = slots.find((candidate) => !candidate.active);
    if (!slot) throw new Error('GPU preview overlap is unavailable.');
    slot.active = true;
    const sceneSignal = sceneLifetime.signal;
    const signal = AbortSignal.any([input.signal, lifetime.signal, sceneSignal]);
    active++;
    const primitives = createReviewGpuPrimitives(args.resources, (role, key, size, paint) =>
      coverage.borrow(args.resources, JSON.stringify([role, key, size]), () => {
        const raster = args.resources.canvas(role, size);
        try {
          paint(raster.context);
          return { value: raster.canvas, release: () => raster.release() };
        } catch (error) {
          raster.release();
          throw error;
        }
      })
    );
    const ownedFrames: VideoFrame[] = [];
    const endpointOutputs: { bitmap: ImageBitmap; release(): void }[] = [];
    const annotationHolds: { release(): void; independent: boolean }[] = [];
    let acquiredOutput: PreviewGpuCanvasLease | null = null;
    let preparedEffects: Awaited<ReturnType<typeof prepareEffectRuntimeGpuScene>> | undefined;
    const releaseAnnotations = (start: number) => {
      for (const hold of annotationHolds.splice(start)) hold.release();
    };
    try {
      initialization ??= createGpuPreviewRenderer({
        reserve: args.reserve,
        maximumInFlight: args.maximumInFlight ?? 1,
      });
      try {
        renderer = await initialization;
      } catch (error) {
        if (signal.aborted || !(error instanceof GpuPreviewDeviceError)) throw error;
        disabled = true;
        fallbackReason = 'device-failed';
        return false;
      }
      signal.throwIfAborted();
      if (!renderer || disposed) {
        disabled = true;
        fallbackReason = 'unavailable';
        return false;
      }
      if (output.kind === 'presentation' && !renderer.createSurface) {
        fallbackReason = 'unavailable';
        return false;
      }
      const {
        scale,
        background,
        base,
        decor: decorRect,
      } = reviewGpuArtworkGeometry(scene, dimensions);
      const drift = reviewGpuStaticBackgroundDrift(scene.background);
      const paintDensity = drift
        ? Math.min(1, 2048 / Math.max(dimensions.backing.width, dimensions.backing.height))
        : 1;
      const paintSize = {
        width: Math.max(1, Math.round(dimensions.backing.width * paintDensity)),
        height: Math.max(1, Math.round(dimensions.backing.height * paintDensity)),
      };
      const key = JSON.stringify([
        dimensions,
        background,
        base.videoRect,
        base.windowRect,
        decorRect,
      ]);
      if (!slot.artwork || slot.artwork.key !== key) {
        clearSlot(slot);
        const retained: RenderCanvasLease[] = [];
        try {
          const bg = args.resources.canvas('preview-gpu-background', paintSize);
          retained.push(bg);
          const decoration = args.resources.canvas('preview-gpu-decoration', decorRect);
          retained.push(decoration);
          const overlay = args.resources.canvas('preview-gpu-captions', dimensions.backing);
          retained.push(overlay);
          const ctx = decoration.context;
          ctx.translate(-decorRect.x, -decorRect.y);
          const radius = background.enabled ? background.layout.cornerRadius : 0;
          drawReviewSceneShadow(ctx, background, base.windowRect, radius, scale);
          slot.artwork = {
            painter: createReviewBackgroundPainter(args.resources),
            background: bg,
            decoration,
            overlay,
            rect: decorRect,
            key,
            backgroundRevision: 0,
            image: null,
            captionKey: '',
            captionOwner: null,
            captionRevision: 0,
          };
        } catch (error) {
          for (const lease of retained) lease.release();
          throw error;
        }
      }
      const art = slot.artwork;
      if (
        art.backgroundRevision === 0 ||
        art.image !== input.image ||
        (scene.background.enabled && hasSceneBackgroundMotion(scene.background.motion) && !drift)
      ) {
        const bgScale = paintSize.width / (scene.canvas?.width ?? scene.source.width);
        const { motion: _motion, ...basePaint } = scene.background;
        const backgroundPaint = drift ? basePaint : scene.background;
        const paint = backgroundPaint.enabled
          ? {
              ...backgroundPaint,
              layout: {
                ...backgroundPaint.layout,
                cornerRadius: backgroundPaint.layout.cornerRadius * bgScale,
                blur: (backgroundPaint.layout.blur ?? 0) * bgScale,
              },
            }
          : backgroundPaint;
        art.painter.draw(art.background.context, {
          background: paint,
          image: input.image,
          ...paintSize,
          currentTime: geometry.resultTime,
        });
        art.image = input.image;
        art.backgroundRevision = ++artworkRevision;
      }
      const captionKey =
        input.captions?.plan.cues
          .filter((cue) => cue.start <= geometry.resultTime && geometry.resultTime < cue.end)
          .map((cue) => cue.id)
          .join('|') ?? '';
      if (
        art.captionOwner !== input.captions ||
        art.captionKey !== captionKey ||
        art.captionRevision === 0
      ) {
        const ctx = art.overlay.context;
        ctx.clearRect(0, 0, dimensions.backing.width, dimensions.backing.height);
        ctx.save();
        ctx.scale(
          dimensions.backing.width / dimensions.canonical.width,
          dimensions.backing.height / dimensions.canonical.height
        );
        input.captions?.draw(ctx, geometry.resultTime);
        ctx.restore();
        art.captionOwner = input.captions;
        art.captionKey = captionKey;
        art.captionRevision = ++artworkRevision;
      }
      const full = { x: 0, y: 0, ...dimensions.canonical };
      const radius = background.enabled ? background.layout.cornerRadius : 0;
      const caption: GpuPreviewLayer = {
        source: art.overlay.canvas,
        rect: full,
        inverse: identity,
        cache: { key: 'captions', revision: art.captionRevision },
      };
      const sceneInputs = {
        dimensions,
        base,
        radius,
        header: input.header,
        artwork: {
          background: art.background.canvas,
          decoration: art.decoration.canvas,
          rect: art.rect,
          backgroundRevision: art.backgroundRevision,
          retainedDrift: drift !== null,
          backgroundSettings: scene.background,
          decorationRevision: art,
        },
        painter: art.painter,
        image: input.image,
        resultTime: geometry.resultTime,
        primitives,
        cameraOverride: input.cameraOverride,
        fps: input.fps,
        annotations: input.annotations,
        retainAnnotationBatch(
          batch: Awaited<ReturnType<NonNullable<typeof input.annotations>['prepareGpu']>>
        ) {
          annotationHolds.push({ ...batch.retain(), independent: batch.independent });
        },
        admit: input.admit,
        signal,
      };
      const moving: Pick<ReviewTransitionSample, 'timestamp' | 'draw' | 'toVideoFrame'> = {
        timestamp: input.frame.timestamp / 1e6,
        draw() {},
      };
      let main: GpuPreviewGroup;
      if (input.transition?.blend.plan.type === 'dissolve') {
        const sides = reviewCutTransitionSides(
          input.transition.blend,
          input.transition.frames,
          moving,
          geometry.resultTime,
          input.transition.resultOffset
        );
        const sources: Array<GpuPreviewGroup | ImageBitmap> = [];
        for (const side of sides) {
          const frame = side.sample === moving ? input.frame : side.sample.toVideoFrame?.();
          if (!frame) throw new Error('Transition GPU pixels are unavailable.');
          if (frame !== input.frame) ownedFrames.push(frame);
          const currentScene =
            (await input.sceneAt?.(side.resultTime, side.sample.timestamp)) ?? scene;
          const pose = reviewPresentedGeometry(
            currentScene,
            dimensions,
            side.resultTime,
            input.cameraOverride
          );
          const firstHold = annotationHolds.length;
          const endpoint = await buildReviewGpuScene({
            ...sceneInputs,
            source: frame,
            scene: currentScene,
            geometry: pose,
            sourceTime: side.sample.timestamp,
            orientation:
              side.sample === moving
                ? input.orientation
                : { rotation: side.sample.rotation ?? 0, flip: side.sample.flip ?? false },
          });
          if (annotationHolds.slice(firstHold).every((hold) => hold.independent))
            sources.push(endpoint);
          else {
            const reservation = args.resources.bytes(
              'preview-gpu-annotation-endpoint',
              dimensions.backing.width * dimensions.backing.height * 4
            );
            let retained = false;
            try {
              const bitmap = await renderer.render({
                output: dimensions.backing,
                logical: dimensions.canonical,
                layers: endpoint.layers,
                signal,
              });
              endpointOutputs.push({ bitmap, release: () => reservation.release() });
              retained = true;
              signal.throwIfAborted();
              sources.push(bitmap);
            } finally {
              if (!retained) reservation.release();
              // Each endpoint fence ends its raw annotation borrow before the next batch admission.
              releaseAnnotations(firstHold);
            }
          }
        }
        main = {
          kind: 'group',
          output: dimensions.backing,
          logical: dimensions.canonical,
          layers: sources.map((source, index) => ({
            source,
            rect: full,
            inverse: identity,
            opacity: index === 0 ? 1 : input.transition!.blend.incoming,
          })),
        };
      } else {
        let source = input.frame;
        let sourceTime = input.sourceTime;
        let orientation = input.orientation;
        if (input.transition) {
          const sides = reviewCutTransitionSides(
            input.transition.blend,
            input.transition.frames,
            moving,
            geometry.resultTime,
            input.transition.resultOffset
          );
          const sample = sides[input.transition.blend.beforeSeam ? 0 : 1].sample;
          if (sample !== moving) {
            const frame = sample.toVideoFrame?.();
            if (!frame) throw new Error('Transition GPU pixels are unavailable.');
            source = frame;
            ownedFrames.push(frame);
            sourceTime = sample.timestamp;
            orientation = { rotation: sample.rotation ?? 0, flip: sample.flip ?? false };
          }
        }
        main = await buildReviewGpuScene({
          ...sceneInputs,
          source,
          scene,
          geometry,
          sourceTime,
          orientation,
        });
      }
      const layers = reviewGpuFinishLayers({
        scene,
        dimensions,
        main,
        sourceTime: input.sourceTime,
        resultTime: geometry.resultTime,
        primitives,
        caption,
        watermark: input.watermark ?? null,
        ...(input.camera ? { camera: input.camera } : {}),
        ...(input.transition?.blend.plan.type === 'fade-black'
          ? {
              blackout: {
                opacity: input.transition.blend.black,
                color: input.transition.blend.plan.color ?? '#000000',
              },
            }
          : {}),
      });
      preparedEffects = await prepareEffectRuntimeGpuScene({ layers, gpu: renderer, signal });
      const request = {
        output: dimensions.backing,
        logical: dimensions.canonical,
        layers: preparedEffects.layers,
        signal,
      };
      if (output.kind === 'presentation') {
        const provider = renderer;
        const lease = output.acquireOutput(dimensions.backing, provider);
        acquiredOutput = lease;
        await lease.surface.present(request);
        signal.throwIfAborted();
        warmUpcoming(input, provider);
        publicationHolds++;
        acquiredOutput = null;
        let released = false;
        return {
          canvas: lease.canvas,
          outputKind: 'gpu-surface',
          retainedProviderBytes: () => (released ? 0 : provider.allocatedBytes),
          isRetiredProvider: () => disposed || failedProviders.has(provider),
          release() {
            if (released) return;
            released = true;
            try {
              lease.release();
            } finally {
              publicationHolds--;
              disposeRetiredRenderer();
            }
          },
        };
      }
      const bitmap = await renderer.render(request);
      try {
        signal.throwIfAborted();
        output.context.drawImage(bitmap, 0, 0);
        warmUpcoming(input, renderer);
      } finally {
        bitmap.close();
      }
      return true;
    } catch (error) {
      // A shared device failure sends every pending request through the same Canvas fallback.
      if (
        disabled &&
        fallbackReason === 'device-failed' &&
        !disposed &&
        !input.signal.aborted &&
        !sceneSignal.aborted
      )
        return false;
      if (signal.aborted || !(error instanceof GpuPreviewDeviceError)) throw error;
      if (renderer) failedProviders.add(renderer);
      renderer?.dispose();
      renderer = null;
      disabled = true;
      fallbackReason = 'device-failed';
      sceneReleased = true;
      lifetime.abort();
      return false;
    } finally {
      preparedEffects?.release();
      try {
        acquiredOutput?.release();
      } finally {
        releaseAnnotations(0);
        for (const output of endpointOutputs) {
          output.bitmap.close();
          output.release();
        }
        primitives.dispose();
        for (const frame of ownedFrames) frame.close();
        slot.active = false;
        active--;
        if (!active) {
          activeScene = null;
          activeDimensions = null;
          activePainter = null;
          activeHeader = null;
          activeImage = null;
          activeWatermark = undefined;
          overlapSafe = false;
          if (disposed || sceneReleased) clear();
        }
        disposeRetiredRenderer();
      }
    }
  }
  return {
    get fallbackReason() {
      return fallbackReason;
    },
    get allocatedBytes() {
      return renderer?.allocatedBytes ?? 0;
    },
    render(input: ReviewGpuRenderInput) {
      return execute(input, { kind: 'bitmap', context: input.context });
    },
    /** The caller attaches each nonfront destination before the GPU writes its completed image. */
    renderPresentation(input: ReviewGpuPresentationInput) {
      return execute(input, { kind: 'presentation', acquireOutput: input.acquireOutput });
    },
    releaseScene() {
      sceneLifetime.abort();
      sceneLifetime = new AbortController();
      // Borrowed artwork remains valid until the active GPU transaction settles.
      if (active) sceneReleased = true;
      else clear();
    },
    dispose() {
      disposed = true;
      lifetime.abort();
      if (!active) clear();
      disposeRetiredRenderer();
    },
  };
}
