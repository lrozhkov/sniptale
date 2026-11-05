import { buildReviewGpuScene } from './gpu-preview-scene';
import type { PreviewRendererStatus } from '../../features/video/preview/preferences';
import { reviewPresentedGeometry, type ReviewPresentedGeometry } from './gpu-preview-geometry';
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
import { drawReviewSceneShadow, reviewSpatialSourceRect } from './scene-shadow';
import type { PreviewScene, PreviewSceneDimensions } from './preview-scene';
import type { prepareReviewCaptions } from './render-captions';
import type { createReviewBackgroundPainter } from './scene-background';
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

const identity: QuickEditHomography = [1, 0, 0, 0, 1, 0, 0, 0, 1];
type Captions = Awaited<ReturnType<typeof prepareReviewCaptions>>;
type Dimensions = PreviewSceneDimensions;

/** Only immutable bare compositions can share retained artwork across pending GPU requests. */
export function reviewGpuPreviewConcurrency(scene: PreviewScene): 1 | 2 {
  const plan = scene.outerFadePlan;
  return scene.background.enabled ||
    scene.zoomRegions.length ||
    scene.comments.length ||
    scene.keys.length ||
    scene.clicks.length ||
    scene.windowHeader ||
    (scene.watermark && scene.watermark.mode !== 'none') ||
    scene.webcam?.enabled ||
    scene.captions?.settings?.enabled ||
    (scene.annotationEffects?.lane.enabled &&
      scene.annotationEffects.lane.instances.some((instance) => instance.enabled)) ||
    (plan &&
      (plan.visualEnvelope.fadeIn !== 0 ||
        plan.visualEnvelope.fadeOut !== 0 ||
        plan.segments.some(
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
  let activeScene: PreviewScene | null = null;
  let activeDimensions: Dimensions | null = null;
  let activePainter: ReturnType<typeof createReviewBackgroundPainter> | null = null;
  let overlapSafe = false;
  let sceneReleased = false;
  let artworkRevision = 0;
  const lifetime = new AbortController();
  let sceneLifetime = new AbortController();
  let artwork: {
    background: RenderCanvasLease;
    decoration: RenderCanvasLease;
    overlay: RenderCanvasLease;
    rect: { x: number; y: number; width: number; height: number };
    key: string;
    backgroundRevision: number;
    captionKey: string;
    captionOwner: Captions | null;
    captionRevision: number;
  } | null = null;
  const clear = () => {
    artwork?.background.release();
    artwork?.decoration.release();
    artwork?.overlay.release();
    artwork = null;
    sceneReleased = false;
  };
  return {
    get fallbackReason() {
      return fallbackReason;
    },
    get allocatedBytes() {
      return renderer?.allocatedBytes ?? 0;
    },
    async render(input: {
      scene: PreviewScene;
      dimensions: Dimensions;
      geometry: ReviewPresentedGeometry;
      frame: VideoFrame;
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
    }) {
      if (disabled || disposed) return false;
      const { scene, dimensions, geometry } = input;
      const safe =
        reviewGpuPreviewConcurrency(scene) === 2 &&
        !input.camera &&
        !input.transition &&
        !input.cameraOverride &&
        !input.captions &&
        !input.annotations &&
        !input.watermark &&
        !input.header &&
        !input.image;
      if (
        active &&
        (active >= (args.maximumInFlight ?? 1) ||
          sceneReleased ||
          !overlapSafe ||
          !safe ||
          activeScene !== scene ||
          activeDimensions !== dimensions ||
          activePainter !== input.painter)
      )
        throw new Error('GPU preview overlap is unavailable.');
      if (!active) {
        activeScene = scene;
        activeDimensions = dimensions;
        activePainter = input.painter;
        overlapSafe = safe;
      }
      const sceneSignal = sceneLifetime.signal;
      const signal = AbortSignal.any([input.signal, lifetime.signal, sceneSignal]);
      active++;
      const primitives = createReviewGpuPrimitives(args.resources);
      const ownedFrames: VideoFrame[] = [];
      const endpointOutputs: { bitmap: ImageBitmap; release(): void }[] = [];
      const annotationHolds: { release(): void }[] = [];
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
          renderer?.dispose();
          disabled = true;
          fallbackReason = 'unavailable';
          return false;
        }
        const scale = dimensions.canonical.width / (scene.canvas?.width ?? scene.source.width);
        const background = scene.background.enabled
          ? {
              ...scene.background,
              layout: {
                ...scene.background.layout,
                cornerRadius: scene.background.layout.cornerRadius * scale,
              },
            }
          : scene.background;
        const base = computeQuickEditSceneLayout({
          ...scene,
          output: dimensions.canonical,
          camera: { scale: 1, centerX: 0.5, centerY: 0.5 },
        });
        const decorRect = reviewSpatialSourceRect({
          output: dimensions.canonical,
          window: base.windowRect,
          background,
          sceneScale: scale,
        });
        const key = JSON.stringify([
          dimensions,
          background,
          base.videoRect,
          base.windowRect,
          decorRect,
        ]);
        if (!artwork || artwork.key !== key) {
          clear();
          const retained: RenderCanvasLease[] = [];
          try {
            const bg = args.resources.canvas('preview-gpu-background', dimensions.backing);
            retained.push(bg);
            const decoration = args.resources.canvas('preview-gpu-decoration', decorRect);
            retained.push(decoration);
            const overlay = args.resources.canvas('preview-gpu-captions', dimensions.backing);
            retained.push(overlay);
            const ctx = decoration.context;
            ctx.translate(-decorRect.x, -decorRect.y);
            const radius = background.enabled ? background.layout.cornerRadius : 0;
            drawReviewSceneShadow(ctx, background, base.windowRect, radius, scale);
            artwork = {
              background: bg,
              decoration,
              overlay,
              rect: decorRect,
              key,
              backgroundRevision: 0,
              captionKey: '',
              captionOwner: null,
              captionRevision: 0,
            };
          } catch (error) {
            for (const lease of retained) lease.release();
            throw error;
          }
        }
        const art = artwork;
        if (
          art.backgroundRevision === 0 ||
          (scene.background.enabled && hasSceneBackgroundMotion(scene.background.motion))
        ) {
          const bgScale = dimensions.backing.width / (scene.canvas?.width ?? scene.source.width);
          const paint = scene.background.enabled
            ? {
                ...scene.background,
                layout: {
                  ...scene.background.layout,
                  cornerRadius: scene.background.layout.cornerRadius * bgScale,
                  blur: (scene.background.layout.blur ?? 0) * bgScale,
                },
              }
            : scene.background;
          input.painter.draw(art.background.context, {
            background: paint,
            image: input.image,
            ...dimensions.backing,
            currentTime: geometry.resultTime,
          });
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
            decorationRevision: art,
          },
          painter: input.painter,
          image: input.image,
          resultTime: geometry.resultTime,
          primitives,
          cameraOverride: input.cameraOverride,
          fps: input.fps,
          annotations: input.annotations,
          retainAnnotationBatch(
            batch: Awaited<ReturnType<NonNullable<typeof input.annotations>['render']>>
          ) {
            annotationHolds.push(batch.retain());
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
                  ? undefined
                  : { rotation: side.sample.rotation ?? 0, flip: side.sample.flip ?? false },
            });
            if (annotationHolds.length === firstHold) sources.push(endpoint);
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
          let orientation: GpuPreviewLayer['orientation'];
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
        const bitmap = await renderer.render({
          output: dimensions.backing,
          logical: dimensions.canonical,
          layers,
          signal,
        });
        try {
          signal.throwIfAborted();
          input.context.drawImage(bitmap, 0, 0);
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
        renderer?.dispose();
        renderer = null;
        disabled = true;
        fallbackReason = 'device-failed';
        sceneReleased = true;
        lifetime.abort();
        return false;
      } finally {
        releaseAnnotations(0);
        for (const output of endpointOutputs) {
          output.bitmap.close();
          output.release();
        }
        primitives.dispose();
        for (const frame of ownedFrames) frame.close();
        active--;
        if (!active) {
          activeScene = null;
          activeDimensions = null;
          activePainter = null;
          overlapSafe = false;
          if (disposed || sceneReleased) clear();
        }
      }
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
      renderer?.dispose();
      void initialization?.then(
        (value) => value?.dispose(),
        () => {}
      );
      if (!active) clear();
    },
  };
}
