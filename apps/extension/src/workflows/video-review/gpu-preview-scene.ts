import { resolveGpuPreviewGroupRasters } from '../../features/video/composition/canvas/gpu-preview-plan';
import { preparedSourceGpuLayers } from '../../features/video/composition/export-enhancement/prepared-source';
import type { ReviewExportSamplingFrame } from './export-source-sampling';
import type {
  GpuPreviewGroup,
  GpuPreviewLayer,
} from '../../features/video/composition/canvas/gpu-preview';
import type { QuickEditHomography } from '../../features/video/composition/motion/spatial-geometry';
import { computeQuickEditSceneCamera } from '../../features/video/review/advanced/scene';
import type { QuickEditCameraTransform } from '../../features/video/review/advanced/types';
import { quickEditMotionBlurCameras } from '../../features/video/review/advanced/motion-blur';
import {
  evaluateSceneBackgroundMotion,
  hasSceneBackgroundMotion,
  sceneBackgroundDriftRect,
} from '../../features/video/project/scene/background-motion';
import type { PreviewScene, PreviewSceneDimensions } from './preview-scene';
import type { createReviewBackgroundPainter } from './scene-background';
import {
  reviewGpuContentLayers,
  reviewGpuSpotlightLayers,
  type ReviewGpuPrimitives,
} from './gpu-preview-layers';
import {
  reviewGpuSourcePlane,
  reviewPresentedGeometry,
  reviewPresentedStageProjection,
  type ReviewPresentedGeometry,
} from './gpu-preview-geometry';
const identity: QuickEditHomography = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Admit a retained base only when drift is the sole time-dependent paint operation. */
export function reviewGpuStaticBackgroundDrift(background: PreviewScene['background']) {
  return background.enabled &&
    background.type !== 'solid' &&
    (background.layout.blur ?? 0) === 0 &&
    background.motion?.mode === 'drift' &&
    hasSceneBackgroundMotion(background.motion)
    ? background.motion
    : null;
}

/** Build one borrowed endpoint scene; the caller owns frames, primitives and GPU publication. */
export async function buildReviewGpuScene(args: {
  source: VideoFrame;
  sampling?: ReviewExportSamplingFrame | null;
  scene: PreviewScene;
  geometry: ReviewPresentedGeometry;
  sourceTime: number;
  orientation?: GpuPreviewLayer['orientation'];
  dimensions: PreviewSceneDimensions;
  base: ReviewPresentedGeometry['layout'];
  radius: number;
  header: ImageBitmap | null;
  artwork: Readonly<{
    background: HTMLCanvasElement;
    decoration: HTMLCanvasElement | null;
    rect: { x: number; y: number; width: number; height: number };
    backgroundRevision: number;
    retainedDrift: boolean;
    backgroundSettings: PreviewScene['background'];
    decorationRevision: object;
  }>;
  painter: ReturnType<typeof createReviewBackgroundPainter>;
  image: ImageBitmap | null;
  resultTime: number;
  primitives: ReviewGpuPrimitives;
  cameraOverride?: QuickEditCameraTransform | undefined;
  fps?: number | undefined;
  annotations?: Parameters<typeof reviewGpuContentLayers>[0]['annotations'] | undefined;
  retainAnnotationBatch?:
    | Parameters<typeof reviewGpuContentLayers>[0]['retainAnnotationBatch']
    | undefined;
  admit?: Parameters<typeof reviewGpuContentLayers>[0]['admit'] | undefined;
  signal: AbortSignal;
}) {
  const {
    source,
    scene: currentScene,
    geometry: currentGeometry,
    sourceTime,
    orientation,
    dimensions,
    base,
    radius,
    header,
    artwork,
    painter,
    image,
    resultTime,
    primitives,
    cameraOverride,
    fps,
    annotations,
    retainAnnotationBatch,
    admit,
    signal,
  } = args;
  const full = { x: 0, y: 0, ...dimensions.canonical };

  const motion = computeQuickEditSceneCamera(currentGeometry.layout, currentScene.background);
  const bgInverse: QuickEditHomography =
    currentGeometry.layout.spatial?.lockBackground || motion.backgroundScale === 1
      ? identity
      : [
          1 / motion.backgroundScale,
          0,
          -motion.x / motion.backgroundScale,
          0,
          1 / motion.backgroundScale,
          -motion.y / motion.backgroundScale,
          0,
          0,
          1,
        ];
  const drift =
    artwork.retainedDrift && artwork.backgroundSettings === currentScene.background
      ? reviewGpuStaticBackgroundDrift(currentScene.background)
      : null;
  const animatedEndpoint =
    currentScene.background.enabled &&
    hasSceneBackgroundMotion(currentScene.background.motion) &&
    currentGeometry.resultTime !== resultTime;
  const needsEndpointPaint = !drift && (animatedEndpoint || artwork.retainedDrift);
  const endpointBackground = needsEndpointPaint
    ? primitives.raster('preview-gpu-transition-background', dimensions.backing, (context) => {
        const bgScale =
          dimensions.backing.width / (currentScene.canvas?.width ?? currentScene.source.width);
        const paint = currentScene.background.enabled
          ? {
              ...currentScene.background,
              layout: {
                ...currentScene.background.layout,
                cornerRadius: currentScene.background.layout.cornerRadius * bgScale,
                blur: (currentScene.background.layout.blur ?? 0) * bgScale,
              },
            }
          : currentScene.background;
        painter.draw(context, {
          background: paint,
          image: image,
          ...dimensions.backing,
          currentTime: currentGeometry.resultTime,
        });
      })
    : artwork.background;
  const bg: GpuPreviewLayer = {
    source: endpointBackground,
    rect: drift
      ? sceneBackgroundDriftRect(
          evaluateSceneBackgroundMotion(drift, currentGeometry.resultTime),
          dimensions.canonical.width,
          dimensions.canonical.height
        )
      : full,
    inverse: bgInverse,
    ...(drift ? { clip: { rect: full, radius: 0, shape: 'hard-rect' as const } } : {}),
    ...(needsEndpointPaint
      ? {}
      : { cache: { key: 'background', revision: artwork.backgroundRevision } }),
  };
  const originalLayers: GpuPreviewLayer[] = [
    ...(artwork.decoration
      ? [
          {
            source: artwork.decoration,
            rect: artwork.rect,
            inverse: identity,
            cache: { key: 'decoration', revision: artwork.decorationRevision },
          },
        ]
      : []),
    ...(header
      ? [
          {
            source: header,
            rect: {
              x: base.windowRect.x,
              y: base.windowRect.y,
              width: base.windowRect.width,
              height: (base.visibleVideoRect ?? base.videoRect).y - base.windowRect.y,
            },
            inverse: identity,
            clampSourceEdges: ['bottom'] as const,
            clip: { rect: base.windowRect, radius },
            cache: { key: 'header', revision: header },
          },
        ]
      : []),
    {
      source,
      rect: base.videoRect,
      inverse: identity,
      ...(orientation ? { orientation } : {}),
      clip: { rect: base.windowRect, radius },
    },
  ];
  const sourceExposures = new WeakMap<GpuPreviewLayer, number>();
  const original: GpuPreviewGroup = {
    kind: 'group',
    logical: dimensions.canonical,
    output: dimensions.canonical,
    layers: originalLayers,
  };
  const samples = cameraOverride
    ? [{ camera: currentGeometry.camera, alpha: 1 }]
    : quickEditMotionBlurCameras(currentScene.zoomRegions, currentGeometry.resultTime, {
        ...currentScene,
        output: dimensions.canonical,
      });
  const exposure: GpuPreviewLayer[] = [];
  const singleExposure = samples.length === 1 && samples[0]!.alpha === 1;
  for (const [exposureIndex, sample] of samples.entries()) {
    const pose = reviewPresentedGeometry(
      currentScene,
      dimensions,
      currentGeometry.resultTime,
      sample.camera
    );
    const focus = pose.camera.spatial?.focus.some(
      (entry) => entry.settings.enabled && entry.weight > 0
    );
    const plane = reviewGpuSourcePlane(pose.layout, currentScene.background);
    const planeLayers = originalLayers.map((layer) => {
      if (layer.source === artwork.decoration)
        return { ...layer, rect: plane.shadowRect(artwork.rect) };
      if (layer.source === source)
        return {
          ...layer,
          rect: plane.video,
          clip: { rect: plane.clip, radius: radius * plane.clipScale },
        };
      if (layer.source === header)
        return {
          ...layer,
          rect: plane.header,
          clip: { rect: plane.clip, radius: radius * plane.clipScale },
        };
      return layer;
    });
    for (const layer of planeLayers)
      if (layer.source === source) sourceExposures.set(layer, exposureIndex);
    const planeSource: GpuPreviewGroup = { ...original, layers: planeLayers };
    if (focus || samples.length > 1)
      exposure.push({
        source: planeSource,
        rect: full,
        inverse: plane.outerInverse,
        ...(focus ? { depth: { frame: pose.camera.spatial!, window: base.windowRect } } : {}),
        opacity: sample.alpha,
        ...(singleExposure ? {} : { blend: 'add' as const }),
      });
    else
      for (const layer of planeLayers) {
        const projected = {
          ...layer,
          inverse: plane.outerInverse,
          opacity: sample.alpha,
          ...(samples.length > 1 ? { blend: 'add' as const } : {}),
        };
        if (layer.source === source) sourceExposures.set(projected, exposureIndex);
        exposure.push(projected);
      }
  }
  const window: GpuPreviewGroup = {
    kind: 'group',
    output: dimensions.backing,
    logical: dimensions.canonical,
    layers: exposure,
  };
  const rawMain: GpuPreviewGroup = {
    kind: 'group',
    output: dimensions.backing,
    logical: dimensions.canonical,
    layers: [bg, { source: window, rect: full, inverse: identity }],
  };
  let sourceDensity = 1;
  const sampled = (
    root: GpuPreviewGroup,
    demandFor: (index: number) => string
  ): GpuPreviewGroup => {
    const sampling = args.sampling;
    if (!sampling) return root;
    const groups = new WeakMap<GpuPreviewGroup, { group: GpuPreviewGroup; density: number }>();
    const visit = (group: GpuPreviewGroup): { group: GpuPreviewGroup; density: number } => {
      const retained = groups.get(group);
      if (retained) return retained;
      let density = 0;
      const layers = group.layers.flatMap((layer): GpuPreviewLayer[] => {
        if (layer.source === source) {
          const id = demandFor(sourceExposures.get(layer) ?? 0);
          // A lens outside the source aperture retains the header and artwork, without video.
          if (!sampling.plan.demands.some((demand) => demand.id === id)) return [];
          const prepared = preparedSourceGpuLayers(sampling.sampling, id, layer.rect);
          if (!prepared) return [layer];
          density = Math.max(density, prepared.density);
          const { orientation: _orientation, ...placement } = layer;
          return prepared.layers.map((tile) => ({
            ...placement,
            ...tile,
            inverse: layer.inverse,
            ...(layer.clip ? { clip: layer.clip } : {}),
          }));
        }
        if ('kind' in layer.source && layer.source.kind === 'group') {
          const child = visit(layer.source);
          density = Math.max(density, child.density);
          return [{ ...layer, source: child.group }];
        }
        return [layer];
      });
      const result = {
        group: {
          ...group,
          layers,
        },
        density,
      };
      groups.set(group, result);
      return result;
    };
    const result = visit(root);
    sourceDensity = Math.max(sourceDensity, result.density);
    return result.group;
  };
  const main = sampled(rawMain, (index) => `body:${index}`);
  const focused = reviewGpuSpotlightLayers({
    scene: currentScene,
    dimensions,
    geometry: currentGeometry,
    source: main,
    sourceForLens: (index) =>
      sampled(rawMain, (exposure) => `scene:${index}${exposure ? `:${exposure}` : ''}`),
    projection: reviewPresentedStageProjection(currentGeometry, dimensions.canonical),
    primitives,
  });
  const contentPlane = reviewGpuSourcePlane(currentGeometry.layout, currentScene.background);
  const overlays = await reviewGpuContentLayers({
    scene: currentScene,
    dimensions,
    base,
    geometry: currentGeometry,
    sourceTime,
    fps: fps ?? 30,
    original,
    originalForLens: (index) => sampled(original, () => `click:${index}`),
    primitives,
    annotations: annotations ?? null,
    ...(retainAnnotationBatch ? { retainAnnotationBatch } : {}),
    admit: admit ?? (() => {}),
    signal,
    sourceClip: {
      rect: contentPlane.sourceClip,
      radius: (radius * contentPlane.clipScale) / contentPlane.innerScale,
    },
  });
  return {
    kind: 'group' as const,
    output: dimensions.backing,
    logical: dimensions.canonical,
    layers: resolveGpuPreviewGroupRasters({
      layers: [
        ...(focused === main ? main.layers : [{ source: focused, rect: full, inverse: identity }]),
        ...overlays.contentLayers,
        ...overlays.viewportLayers,
      ],
      output: dimensions.backing,
      logical: dimensions.canonical,
      sourceDensity,
    }),
  };
}
