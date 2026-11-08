import { reviewSpatialOverlayBounds } from './spatial-overlay-bounds';
import { resolveReviewSpatialFilterLevels } from '../../features/video/composition/canvas/spatial-filter-levels';
import { reviewSpatialSourceRect } from './scene-shadow';
import {
  createExportEnhancer,
  type ExportEnhancer,
} from '../../features/video/composition/export-enhancement/enhancer';
import { parseEnhancementMode } from '../../features/video/composition/export-enhancement/mode';
import {
  createPreparedSourceBudget,
  hasMagnificationDemand,
  prepareSourceSampling,
} from '../../features/video/composition/export-enhancement/prepared-source';
import type {
  PreparedSourceSampling,
  SourceSamplingRect,
} from '../../features/video/composition/draw/media-source';
import type { VideoExportDetailMode } from '../../features/video/project/types/export';
import { planReviewExportSource, type ReviewExportSourcePlan } from './export-source-plan';
import type { ReviewExportSourceScene } from './export-source-plan';
import type { QuickEditCameraTransform } from '../../features/video/review/advanced/types';
import {
  computeQuickEditWindowTransform,
  computeQuickEditSceneCamera,
  type computeQuickEditSceneLayout,
} from '../../features/video/review/advanced/scene';
import { projectedDensityBound } from '../../features/video/composition/export-enhancement/projection-density';
import {
  invertQuickEditProjection,
  multiplyQuickEditProjections,
  projectQuickEditPoint,
  type QuickEditHomography,
} from '../../features/video/composition/motion/spatial-geometry';

export interface ReviewExportSamplingFrame {
  readonly plan: ReviewExportSourcePlan;
  readonly sampling: PreparedSourceSampling;
  readonly original: {
    draw(
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
      width: number,
      height: number
    ): void;
  };
  dispose(): void;
}
export interface ReviewExportSamplingPaint {
  frame: ReviewExportSamplingFrame;
  demandId?: string | undefined;
  exposureIndex?: number;
  sourceAbsent?: boolean;
  transform?: QuickEditHomography;
  lens?: ReviewExportSourcePlan['lenses'][number];
}

/** Limit a projected sharp stage to the pixels that can reach its existing lens opening. */
export function reviewExportProjectedRegion(
  clip: SourceSamplingRect,
  projection: QuickEditHomography,
  source: SourceSamplingRect,
  support = 2
): SourceSamplingRect | null {
  const inverse = invertQuickEditProjection(projection);
  if (!inverse) throw new Error('Export sharp projection is unavailable.');
  const points = [
    { x: clip.x, y: clip.y },
    { x: clip.x + clip.width, y: clip.y },
    { x: clip.x, y: clip.y + clip.height },
    { x: clip.x + clip.width, y: clip.y + clip.height },
  ].map((p) => {
    const value = projectQuickEditPoint(inverse, p);
    if (!value) throw new Error('Export sharp source crosses the camera horizon.');
    return value;
  });
  const x = Math.max(source.x, Math.min(...points.map((p) => p.x)) - support),
    y = Math.max(source.y, Math.min(...points.map((p) => p.y)) - support);
  const right = Math.min(source.x + source.width, Math.max(...points.map((p) => p.x)) + support),
    bottom = Math.min(source.y + source.height, Math.max(...points.map((p) => p.y)) + support);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

/** A dense joined window stores only the visible logical region, retaining native header/video coverage. */
export function reviewExportWindowSampling(
  paint: Pick<ReviewExportSamplingPaint, 'exposureIndex' | 'lens' | 'sourceAbsent'> & {
    frame: Pick<ReviewExportSamplingFrame, 'plan'>;
  },
  layout: Omit<ReturnType<typeof computeQuickEditSceneLayout>, 'windowRect'> & {
    windowRect?: SourceSamplingRect;
  },
  background: ReviewExportSourceScene['background'],
  id: string
) {
  const base = layout.windowRect ?? layout.videoRect,
    window = computeQuickEditWindowTransform(layout),
    scale = window.width / base.width;
  const h: QuickEditHomography = [
    scale,
    0,
    window.x - base.x * scale,
    0,
    scale,
    window.y - base.y * scale,
    0,
    0,
    1,
  ];
  const exposure = paint.frame.plan.exposures[paint.exposureIndex ?? 0]!;
  const motion = computeQuickEditSceneCamera(
    layout,
    layout.spatial ? { ...background, zoomBehavior: 'fixed' } : background
  );
  const total = paint.lens
    ? multiplyQuickEditProjections(
        paint.lens.transform,
        paint.lens.kind === 'scene' ? multiplyQuickEditProjections(exposure.projection, h) : h
      )
    : h;
  const inverse = invertQuickEditProjection(total);
  if (!inverse) throw new Error('Export window sampling projection is unavailable.');
  const clip = paint.lens?.bounds ?? motion.windowClip;
  const points = [
    { x: clip.x, y: clip.y },
    { x: clip.x + clip.width, y: clip.y },
    { x: clip.x, y: clip.y + clip.height },
    { x: clip.x + clip.width, y: clip.y + clip.height },
  ].map((p) => {
    const v = projectQuickEditPoint(inverse, p);
    if (!v) throw new Error('Export window crosses the camera horizon.');
    return v;
  });
  const x = Math.max(base.x, Math.min(...points.map((p) => p.x))),
    y = Math.max(base.y, Math.min(...points.map((p) => p.y)));
  const right = Math.min(base.x + base.width, Math.max(...points.map((p) => p.x))),
    bottom = Math.min(base.y + base.height, Math.max(...points.map((p) => p.y)));
  const region = right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : base;
  const demand = paint.frame.plan.demands.find((d) => d.id === id);
  if (!demand && !paint.sourceAbsent) throw new Error('Export source demand is unavailable.');
  const density = demand
    ? Math.max(
        ((demand.targetRasterSize.width / demand.originalPixelROI.width) *
          paint.frame.plan.identity.sourceSize.width) /
          layout.videoRect.width,
        ((demand.targetRasterSize.height / demand.originalPixelROI.height) *
          paint.frame.plan.identity.sourceSize.height) /
          layout.videoRect.height
      )
    : Math.max(1, projectedDensityBound(total, region));
  return {
    region,
    backing: {
      width: Math.max(1, Math.ceil(region.width * density)),
      height: Math.max(1, Math.ceil(region.height * density)),
    },
  };
}
/** The export attempt alone owns and drains this lazy backend. Preview callers do not construct it. */
export function createReviewExportSampling(
  mode: VideoExportDetailMode | undefined
): ExportEnhancer | null {
  const selected = parseEnhancementMode(mode);
  return selected === 'off' ? null : createExportEnhancer({ mode: selected });
}
/** Preserve original decoded pixels before any window, transition, header or effect composition. */
export async function prepareReviewExportSourceSampling(args: {
  enhancer: Pick<ExportEnhancer, 'withEnhancedRegion'>;
  scene: Readonly<ReviewExportSourceScene>;
  output: { width: number; height: number };
  sample: {
    timestamp?: number;
    draw(
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
      width: number,
      height: number
    ): void;
  };
  sourceTime: number;
  resultTime: number;
  signal: AbortSignal;
  camera?: QuickEditCameraTransform;
}): Promise<ReviewExportSamplingFrame | null> {
  args.signal.throwIfAborted();
  const identity = {
    sourceKey: args.sample,
    sourceTime: args.sample.timestamp ?? args.sourceTime,
    passTime: args.resultTime,
    sourceSize: args.scene.sourceSize,
  };
  const plan = planReviewExportSource({
    scene: args.scene,
    output: args.output,
    identity,
    resultTime: args.resultTime,
    ...(args.camera ? { camera: args.camera } : {}),
  });
  if (!hasMagnificationDemand(plan.demands)) return null;
  const budget = createPreparedSourceBudget();
  const releaseRaw = budget.reserve(identity.sourceSize.width, identity.sourceSize.height);
  const raw = document.createElement('canvas');
  raw.width = identity.sourceSize.width;
  raw.height = identity.sourceSize.height;
  let prepared: Awaited<ReturnType<typeof prepareSourceSampling>> | undefined;
  let released = false;
  const dispose = () => {
    if (released) return;
    released = true;
    prepared?.dispose();
    raw.width = raw.height = 0;
    releaseRaw();
  };
  try {
    const context = raw.getContext('2d', { alpha: false, colorSpace: 'srgb' });
    if (!context) throw new Error('Original export source is unavailable.');
    context.imageSmoothingEnabled = false;
    args.sample.draw(context, 0, 0, raw.width, raw.height);
    prepared = await prepareSourceSampling({
      enhancer: args.enhancer,
      budget,
      identity,
      source: raw,
      demands: plan.demands,
      signal: args.signal,
    });
    args.signal.throwIfAborted();
    return {
      plan,
      sampling: prepared.sampling,
      original: {
        draw: (context, x, y, width, height) => {
          if (released) throw new Error('Export source sampling is disposed.');
          context.drawImage(raw, x, y, width, height);
        },
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
/** Paint each prepared source tile once; the existing content clip hides unrequested source pixels. */
export function drawReviewPreparedSource(
  context: CanvasRenderingContext2D,
  sampling: PreparedSourceSampling,
  id: string,
  destination: SourceSamplingRect
): boolean {
  return sampling.visitPreparedTiles(id, (tile) => {
    const source = tile.physicalSourceRect,
      roi = tile.originalPixelROI;
    context.drawImage(
      tile.image,
      source.x,
      source.y,
      source.width,
      source.height,
      destination.x + (roi.x / sampling.sourceSize.width) * destination.width,
      destination.y + (roi.y / sampling.sourceSize.height) * destination.height,
      (roi.width / sampling.sourceSize.width) * destination.width,
      (roi.height / sampling.sourceSize.height) * destination.height
    );
  });
}

/** One logical projection description supplies both dense paint and its allocation graph. */
export function reviewExportSpatialRaster(args: {
  projection: QuickEditHomography;
  output: { width: number; height: number };
  frame: NonNullable<QuickEditCameraTransform['spatial']>;
  density: number;
  fullSourceRect: SourceSamplingRect;
  lens?: ReviewExportSourcePlan['lenses'][number];
}) {
  const inverse = invertQuickEditProjection(args.projection);
  if (!inverse) throw new Error('Export plane projection is unavailable.');
  const levels = resolveReviewSpatialFilterLevels({
    inverse,
    output: args.output,
    precision: 16,
    sourceScale: { x: args.density, y: args.density },
    blurWeights: args.frame.focus.map((f) => f.weight * f.settings.strength),
  });
  const support = (6 * 2 ** (levels - 1) + 1) / args.density;
  const sourceRect =
    args.lens?.kind === 'scene'
      ? reviewExportProjectedRegion(args.lens.bounds, args.projection, args.fullSourceRect, support)
      : args.fullSourceRect;
  return sourceRect
    ? {
        sourceRect,
        backing: {
          width: Math.ceil(sourceRect.width * args.density),
          height: Math.ceil(sourceRect.height * args.density),
        },
      }
    : null;
}
/** Physical pass bounds only; this calculation neither allocates nor initializes an enhancer. */
export function reviewExportSamplingAllocation(
  plan: ReviewExportSourcePlan,
  output: { width: number; height: number },
  background: ReviewExportSourceScene['background'],
  sceneScale = 1
) {
  let width = 1,
    height = 1,
    windowWidth = 1,
    windowHeight = 1;
  for (const [index, exposure] of plan.exposures.entries()) {
    for (const lens of [undefined, ...plan.lenses]) {
      const id = lens ? (index ? `${lens.id}:${index}` : lens.id) : exposure.body.id;
      const window = reviewExportWindowSampling(
        {
          frame: { plan },
          exposureIndex: index,
          ...(lens ? { lens } : {}),
          sourceAbsent: !plan.demands.some((d) => d.id === id),
        },
        exposure.planeLayout,
        background,
        id
      );
      windowWidth = Math.max(windowWidth, window.backing.width);
      windowHeight = Math.max(windowHeight, window.backing.height);
    }
    if (!exposure.layout.spatial) continue;
    const fullSourceRect = reviewSpatialSourceRect({
      output,
      window: exposure.layout.windowRect,
      background: { ...background, zoomBehavior: 'fixed' },
      sceneScale,
    });
    for (const lens of [undefined, ...plan.lenses.filter((l) => l.kind === 'scene')]) {
      const projection = lens
        ? multiplyQuickEditProjections(lens.transform, exposure.projection)
        : exposure.projection;
      const density = exposure.planeDensity * (lens ? Math.max(1, lens.transform[0]!) : 1);
      const raster = reviewExportSpatialRaster({
        projection,
        output,
        frame: exposure.layout.spatial,
        density,
        fullSourceRect,
        ...(lens ? { lens } : {}),
      });
      if (raster) {
        width = Math.max(width, raster.backing.width);
        height = Math.max(height, raster.backing.height);
      }
    }
  }
  const overlayBounds = reviewSpatialOverlayBounds({
    output,
    layout: plan.layout,
    background,
    sourceWidth: plan.identity.sourceSize.width,
    clicks: plan.clickFrames,
  });
  return {
    active: hasMagnificationDemand(plan.demands),
    window: { width: windowWidth, height: windowHeight },
    plane: { width, height },
    overlay: {
      width: Math.ceil(overlayBounds.width * plan.overlayDensity),
      height: Math.ceil(overlayBounds.height * plan.overlayDensity),
    },
  };
}
