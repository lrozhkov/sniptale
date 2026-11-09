import { getCanvasPointsBounds } from '@sniptale/runtime-contracts/canvas-interactions';
import { sourceClickSamplingDemandId } from '../../../features/video/composition/draw/effects/actions';
import { parseEnhancementMode } from '../../../features/video/composition/export-enhancement/mode';
import { hasMagnificationDemand } from '../../../features/video/composition/export-enhancement/prepared-source';
import { samplingRasterSize } from '../../../features/video/composition/export-enhancement/projection-density';
import {
  getFittedMediaContentFrame,
  resolveFittedWindowRaster,
  getFittedMediaWindowFrame,
  getFittedMediaOriginalWindowFrame,
} from '../../../features/video/composition/draw/fitted-media';
import { admittedVisualWindowHeader } from '../../../features/video/composition/draw/window-header';
import { type SourceSamplingDemand } from '../../../features/video/composition/draw/media-source';
import {
  resolveCompositionSceneSpotlights,
  sampleCompositionSpotlightLayer,
} from '../../../features/video/composition/draw/project-spotlight';
import {
  scaleQuickEditRectAboutCenter,
  invertQuickEditProjection,
  multiplyQuickEditProjections,
  projectQuickEditPoint,
  type QuickEditHomography,
} from '../../../features/video/composition/motion/spatial-geometry';
import { motionCameraProjection } from '../../../features/video/composition/motion/spatial';
import { shouldLockVisualLayerToViewport } from '../../../features/video/composition/motion/layer-camera';
import { resolveVideoCompositionRenderPasses } from '../../../features/video/composition/timeline/render';
import type {
  VideoCompositionFrame,
  VideoCompositionVisualLayer,
} from '../../../features/video/composition/types';
import type { EffectRuntimeFramePlan } from '../../../features/video/composition/effect-runtime/runtime/types';
import { resolveProjectOutputTransform } from '../../../features/video/project/export/output-dimensions';
import { resolveProjectExportRange } from '../../../features/video/project/export/range';
import { getVideoClipSourceTime } from '../../../features/video/project/timeline';
import type {
  VideoProject,
  VideoProjectExportSettings,
} from '../../../features/video/project/types';

type Rect = { x: number; y: number; width: number; height: number };
type VideoLayer = Extract<VideoCompositionVisualLayer, { kind: 'video' }>;
const IDENTITY: QuickEditHomography = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function inverseROI(matrix: QuickEditHomography, aperture: Rect, source: Rect): Rect | null {
  const inverse = invertQuickEditProjection(matrix);
  if (!inverse) throw new Error('Export sampling projection is unavailable.');
  const points = [
    [aperture.x, aperture.y],
    [aperture.x + aperture.width, aperture.y],
    [aperture.x, aperture.y + aperture.height],
    [aperture.x + aperture.width, aperture.y + aperture.height],
  ].map(([x, y]) => projectQuickEditPoint(inverse, { x: x!, y: y! }));
  if (points.some((p) => !p)) throw new Error('Export sampling projection crosses its horizon.');
  const area = getCanvasPointsBounds(points.flatMap((p) => (p ? [p] : [])));
  const x = Math.max(source.x, area.x),
    y = Math.max(source.y, area.y);
  const right = Math.min(source.x + source.width, area.x + area.width),
    bottom = Math.min(source.y + source.height, area.y + area.height);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}
function fittedLayerMapping(
  layer: VideoLayer,
  size: { width: number; height: number },
  windowHeader: ReturnType<typeof admittedVisualWindowHeader>['windowHeader']
) {
  return {
    frame: layer,
    fitMode: layer.clip.fitMode,
    sourceWidth: size.width,
    sourceHeight: size.height,
    ...(layer.clip.sourceCrop ? { sourceCrop: layer.clip.sourceCrop } : {}),
    ...(windowHeader ? { windowHeader } : {}),
    ...(layer.trackRole === 'CAMERA' && layer.clip.cameraAppearance
      ? { cameraAppearance: layer.clip.cameraAppearance }
      : {}),
  };
}
function layerMapping(
  layer: VideoLayer,
  size: { width: number; height: number },
  images: Record<string, HTMLImageElement>,
  deviceScale = 1
) {
  const { windowHeader, windowHeaderImage } = admittedVisualWindowHeader(
    layer.clip,
    images,
    layer.trackRole === 'CAMERA'
  );
  const params = fittedLayerMapping(layer, size, windowHeader);
  const content = windowHeaderImage
    ? resolveFittedWindowRaster(params, deviceScale, windowHeaderImage.naturalHeight).source
    : getFittedMediaContentFrame(params);
  const mirrored = layer.trackRole === 'CAMERA' && layer.clip.cameraMirrored;
  const fit: QuickEditHomography = [
    (content.width / size.width) * (mirrored ? -1 : 1),
    0,
    mirrored ? 2 * layer.x + layer.width - content.x : content.x,
    0,
    content.height / size.height,
    content.y,
    0,
    0,
    1,
  ];
  return multiplyQuickEditProjections(
    layerTransform(layer),
    multiplyQuickEditProjections(layer.sourceContentTransform ?? IDENTITY, fit)
  );
}
function layerTransform(layer: VideoLayer): QuickEditHomography {
  const angle = (layer.rotation * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle),
    x = layer.x + layer.width / 2,
    y = layer.y + layer.height / 2;
  const state = layer.renderState;
  return [
    state.scaleX * c,
    -state.scaleX * s,
    x + state.translateX - state.scaleX * c * x + state.scaleX * s * y,
    state.scaleY * s,
    state.scaleY * c,
    y + state.translateY - state.scaleY * s * x - state.scaleY * c * y,
    0,
    0,
    1,
  ];
}
export function projectNativeSamplingRect(matrix: QuickEditHomography, rect: Rect): Rect {
  const points = [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x, rect.y + rect.height],
    [rect.x + rect.width, rect.y + rect.height],
  ].map(([x, y]) => projectQuickEditPoint(matrix, { x: x!, y: y! }));
  if (points.some((p) => !p)) throw new Error('Sampling aperture crosses its horizon.');
  return getCanvasPointsBounds(points.flatMap((p) => (p ? [p] : [])));
}

export function nativeSamplingTargetIncludes(
  plan: EffectRuntimeFramePlan,
  clipId: string,
  frame?: VideoCompositionFrame
): boolean {
  if (
    [...(frame?.visualLayers ?? []), ...(frame?.effectInputLayers ?? [])].some(
      (layer) =>
        layer.kind === 'effect' &&
        layer.clip.effectInstanceId === plan.effectInstanceId &&
        layer.sourceAttachment?.owner.clipId === clipId
    )
  )
    return true;
  const target = plan.target;
  if (target.kind === 'clip') return target.clipId === clipId;
  if (target.kind === 'track' || target.kind === 'video-group')
    return target.clipIds.includes(clipId);
  if (target.kind === 'transition')
    return target.leadingClipId === clipId || target.trailingClipId === clipId;
  return false;
}
export interface NativeSamplingSourcePlan {
  clipId: string;
  sourceSize: { width: number; height: number };
  demands: SourceSamplingDemand[];
  sourceRasterScale: number;
  captureScales: Map<string, number>;
}
type SamplingAperture = {
  id: string;
  rect: Rect;
  projection: QuickEditHomography;
  world: QuickEditHomography;
  isolatedScale: number;
  captureId: string;
};
type SamplingApertureCandidate = [
  id: string,
  aperture: Rect,
  world: QuickEditHomography,
  sourceLens: QuickEditHomography,
  isolatedScale: number,
  captureId: string,
];
type SourceClickSamplingAperture = {
  id: string;
  sourceLens: QuickEditHomography;
  rect: Rect;
  sourceAperture: Rect;
};
function resolveNestedSceneSamplingApertures(
  apertures: readonly SamplingAperture[],
  sceneIds: readonly string[],
  cameraOutput: QuickEditHomography
): SamplingApertureCandidate[] {
  const candidates: SamplingApertureCandidate[] = [];
  const globalIds = new Set(sceneIds.map((id) => `sceneLens:${id}`));
  const globalApertures = apertures.filter((a) => globalIds.has(a.id));
  const isolatedApertures = apertures.filter(
    (a) => a.id.startsWith('sceneLens:') && !globalIds.has(a.id)
  );
  for (const outer of globalApertures)
    for (const inner of isolatedApertures) {
      const inverse = invertQuickEditProjection(cameraOutput);
      if (!inverse) throw new Error('Sampling camera projection is unavailable.');
      const lensTransform = multiplyQuickEditProjections(outer.world, inverse);
      const innerArea = projectNativeSamplingRect(lensTransform, inner.rect);
      const x = Math.max(outer.rect.x, innerArea.x),
        y = Math.max(outer.rect.y, innerArea.y);
      const right = Math.min(outer.rect.x + outer.rect.width, innerArea.x + innerArea.width),
        bottom = Math.min(outer.rect.y + outer.rect.height, innerArea.y + innerArea.height);
      if (right > x && bottom > y)
        candidates.push([
          `${outer.id}/${inner.id}`,
          { x, y, width: right - x, height: bottom - y },
          multiplyQuickEditProjections(lensTransform, inner.world),
          IDENTITY,
          inner.isolatedScale,
          outer.captureId,
        ]);
    }

  return candidates;
}
function resolveSourceClickSamplingApertures(
  layer: VideoLayer,
  projection: QuickEditHomography,
  cameraOutput: QuickEditHomography,
  sourceSize: { width: number; height: number }
) {
  const candidates: SamplingApertureCandidate[] = [];
  const clicks: SourceClickSamplingAperture[] = [];
  for (const action of layer.actions ?? []) {
    const feedback = action.gestureFeedback,
      lens = feedback?.lens,
      point = action.point;
    if (
      feedback?.effect !== 'magnify' ||
      !lens ||
      lens.scale <= 1 ||
      !point ||
      feedback.radius <= 0
    )
      continue;
    const aperture = {
      x: point.x * sourceSize.width - feedback.radius,
      y: point.y * sourceSize.height - feedback.radius,
      width: feedback.radius * 2,
      height: feedback.radius * 2,
    };
    const sourceLens = scaleQuickEditRectAboutCenter(aperture, lens.scale),
      id = sourceClickSamplingDemandId(action);
    candidates.push([
      id,
      projectNativeSamplingRect(projection, aperture),
      cameraOutput,
      sourceLens,
      1,
      'body',
    ]);
    clicks.push({
      id,
      sourceLens,
      rect: projectNativeSamplingRect(projection, aperture),
      sourceAperture: aperture,
    });
  }

  return { clicks, candidates };
}
function resolveSceneClickSamplingApertures(
  apertures: readonly SamplingAperture[],
  clicks: readonly SourceClickSamplingAperture[]
): SamplingApertureCandidate[] {
  const candidates: SamplingApertureCandidate[] = [];
  for (const scene of apertures.filter((d) => d.id.startsWith('sceneLens:')))
    for (const click of clicks) {
      const clickArea = projectNativeSamplingRect(scene.projection, click.sourceAperture);
      const x = Math.max(scene.rect.x, clickArea.x),
        y = Math.max(scene.rect.y, clickArea.y);
      const right = Math.min(scene.rect.x + scene.rect.width, clickArea.x + clickArea.width),
        bottom = Math.min(scene.rect.y + scene.rect.height, clickArea.y + clickArea.height);
      if (right > x && bottom > y)
        candidates.push([
          `${scene.id}/${click.id}`,
          { x, y, width: right - x, height: bottom - y },
          scene.world,
          click.sourceLens,
          scene.isolatedScale,
          scene.captureId,
        ]);
    }

  return candidates;
}
/** The original-pixel projection and active apertures come from the existing composition frame. */
export function resolveNativeSourceSamplingDemands(args: {
  project: VideoProject;
  settings: VideoProjectExportSettings;
  frame: VideoCompositionFrame;
  time: number;
  images?: Record<string, HTMLImageElement>;
  lensFrame?: VideoCompositionFrame;
  captureRasterScales?: ReadonlyMap<string, number>;
}): NativeSamplingSourcePlan[] {
  const { project, settings, frame, time } = args;
  const output = resolveProjectOutputTransform(project, settings);
  const fit: QuickEditHomography = [
    output.scale,
    0,
    output.offsetX,
    0,
    output.scale,
    output.offsetY,
    0,
    0,
    1,
  ];
  const camera = frame.camera.spatial
    ? motionCameraProjection(frame.camera)
    : ([
        frame.camera.scale,
        0,
        -frame.camera.viewportX * frame.camera.scale,
        0,
        frame.camera.scale,
        -frame.camera.viewportY * frame.camera.scale,
        0,
        0,
        1,
      ] satisfies QuickEditHomography);
  if (!camera) throw new Error('Export sampling camera is unavailable.');
  const viewport = { x: 0, y: 0, width: settings.width, height: settings.height };
  const lensFrame = args.lensFrame ?? frame;
  const sceneLenses =
    lensFrame.sceneSpotlights?.flatMap((state) =>
      resolveCompositionSceneSpotlights({
        project,
        frame: { ...lensFrame, sceneSpotlights: [state] },
        images: args.images ?? {},
        viewport,
        composition: { x: output.offsetX, y: output.offsetY, scale: output.scale },
        transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      }).map((lens) => ({ state, lens }))
    ) ?? [];
  const result: NativeSamplingSourcePlan[] = [];
  const sourceLayers = [
    ...frame.visualLayers.flatMap((layer) =>
      layer.kind === 'video'
        ? [{ layer, inputOnly: false }]
        : layer.kind === 'effect' && layer.sourceAttachment
          ? [{ layer: layer.sourceAttachment.owner, inputOnly: true }]
          : []
    ),
    ...frame.effectInputLayers.flatMap((layer) =>
      layer.kind === 'video'
        ? [{ layer, inputOnly: true }]
        : layer.kind === 'effect' && layer.sourceAttachment
          ? [{ layer: layer.sourceAttachment.owner, inputOnly: true }]
          : []
    ),
  ];
  for (const { layer, inputOnly } of sourceLayers) {
    if (layer.opacity <= 0 && !inputOnly) continue;
    const metadata = project.assets.find((a) => a.id === layer.clip.assetId)?.metadata;
    if (!metadata || !(metadata.width > 0 && metadata.height > 0))
      throw new Error('Export source dimensions are unavailable.');
    const sourceSize = { width: metadata.width, height: metadata.height };
    const cameraOutput = multiplyQuickEditProjections(
      fit,
      shouldLockVisualLayerToViewport(layer, frame.camera) ? IDENTITY : camera
    );
    const localFor = (
      world: QuickEditHomography,
      sourceScale = 1,
      isolatedScale = 1,
      captureId = 'body'
    ) =>
      layerMapping(
        layer,
        sourceSize,
        args.images ?? {},
        (frame.camera.spatial && args.captureRasterScales?.has(captureId)
          ? args.captureRasterScales!.get(captureId)! *
            samplingRasterSize({ roi: layer, projection: layerTransform(layer) }).density *
            isolatedScale
          : samplingRasterSize({
              roi: layer,
              projection: multiplyQuickEditProjections(world, layerTransform(layer)),
            }).density) * sourceScale
      );
    const local = localFor(cameraOutput);
    const projection = multiplyQuickEditProjections(cameraOutput, local);
    const crop = layer.clip.sourceCrop ?? { x: 0, y: 0, width: 1, height: 1 };
    const source = {
      x: crop.x * sourceSize.width,
      y: crop.y * sourceSize.height,
      width: crop.width * sourceSize.width,
      height: crop.height * sourceSize.height,
    };
    const identity = {
      sourceKey: { clipId: layer.clipId, assetId: layer.clip.assetId },
      sourceTime: getVideoClipSourceTime(layer.clip, time),
      passTime: time,
      sourceSize,
    };
    const demands: SourceSamplingDemand[] = [];
    const captureScales = new Map<string, number>();
    let sourceRasterScale = output.scale;
    const apertures: SamplingAperture[] = [];
    const append = (
      id: string,
      aperture: Rect,
      world = cameraOutput,
      sourceLens = IDENTITY,
      isolatedScale = 1,
      captureId = id
    ) => {
      const effective = multiplyQuickEditProjections(
        multiplyQuickEditProjections(
          world,
          localFor(world, sourceLens[0], isolatedScale, captureId)
        ),
        sourceLens
      );
      const roi = inverseROI(effective, aperture, source);
      if (!roi) return;
      const raster = samplingRasterSize({ roi, projection: effective });
      const localDensity = samplingRasterSize({ roi, projection: local }).density;
      sourceRasterScale = Math.max(sourceRasterScale, raster.density / localDensity);
      if (id === captureId)
        captureScales.set(id, Math.max(output.scale, raster.density / localDensity));
      if (demands.some((d) => d.id === id)) return;
      demands.push({
        ...identity,
        id,
        originalPixelROI: roi,
        sourceToOutputHomography: effective,
        targetRasterSize: { width: raster.width, height: raster.height },
      });
      apertures.push({
        id,
        rect: aperture,
        projection: effective,
        world,
        isolatedScale,
        captureId,
      });
    };
    if (!layer.effectActionsOnly) append('body', viewport);
    for (const { state, lens } of sceneLenses)
      if (lens.lens && lens.lens.scale > 1 && lens.opening.width > 0 && lens.opening.height > 0) {
        if (
          state.afterClipId &&
          frame.visualLayers.findIndex((l) => l.clipId === layer.clipId) >
            frame.visualLayers.findIndex((l) => l.clipId === state.afterClipId)
        )
          continue;
        const aperture = lens.projection
          ? projectNativeSamplingRect(lens.projection, lens.opening)
          : lens.opening;
        const effective = multiplyQuickEditProjections(
          scaleQuickEditRectAboutCenter(aperture, lens.lens.scale),
          cameraOutput
        );
        append(`sceneLens:${state.id}`, aperture, effective);
      }
    for (const state of layer.spotlights ?? []) {
      const { windowHeader } = admittedVisualWindowHeader(
        layer.clip,
        args.images ?? {},
        layer.trackRole === 'CAMERA'
      );
      const mapping = fittedLayerMapping(layer, sourceSize, windowHeader);
      const window =
        state.coordinateSpace === 'source-window'
          ? getFittedMediaOriginalWindowFrame(mapping)
          : getFittedMediaWindowFrame(mapping);
      const sampled = sampleCompositionSpotlightLayer({
        state,
        window,
        extent: window,
        scale: output.scale,
        projection: layerTransform(layer),
      });
      if (
        !sampled.lens ||
        sampled.lens.scale <= 1 ||
        sampled.opening.width <= 0 ||
        sampled.opening.height <= 0
      )
        continue;
      const worldAperture = projectNativeSamplingRect(layerTransform(layer), sampled.opening);
      const effective = multiplyQuickEditProjections(
        cameraOutput,
        scaleQuickEditRectAboutCenter(worldAperture, sampled.lens.scale)
      );
      append(
        `sceneLens:${state.id}`,
        projectNativeSamplingRect(cameraOutput, worldAperture),
        effective,
        IDENTITY,
        sampled.lens.scale,
        'body'
      );
    }
    for (const candidate of resolveNestedSceneSamplingApertures(
      apertures,
      sceneLenses.map(({ state }) => state.id),
      cameraOutput
    ))
      append(...candidate);
    const { clicks, candidates: clickCandidates } = resolveSourceClickSamplingApertures(
      layer,
      projection,
      cameraOutput,
      sourceSize
    );
    for (const candidate of clickCandidates) append(...candidate);
    for (const candidate of resolveSceneClickSamplingApertures(apertures, clicks))
      append(...candidate);
    if (
      (frame.effectRuntimePlans ?? []).some((plan) =>
        nativeSamplingTargetIncludes(plan, layer.clipId, frame)
      )
    ) {
      const density = Math.max(
        1,
        ...demands.map(
          (d) =>
            samplingRasterSize({ roi: d.originalPixelROI, projection: d.sourceToOutputHomography })
              .density
        )
      );
      const full = { x: 0, y: 0, ...sourceSize };
      const target = {
        width: Math.ceil(sourceSize.width * density),
        height: Math.ceil(sourceSize.height * density),
      };
      demands.push({
        ...identity,
        id: 'effectInput',
        originalPixelROI: full,
        sourceToOutputHomography: [density, 0, 0, 0, density, 0, 0, 0, 1],
        targetRasterSize: target,
      });
    }
    const existing = result.find((p) => p.clipId === layer.clipId);
    if (existing) {
      for (const demand of demands)
        if (!existing.demands.some((d) => d.id === demand.id))
          existing.demands.push({
            ...demand,
            sourceKey: existing.demands[0]?.sourceKey ?? demand.sourceKey,
          });
      existing.sourceRasterScale = Math.max(existing.sourceRasterScale, sourceRasterScale);
      for (const [id, scale] of captureScales)
        existing.captureScales.set(
          id,
          Math.max(existing.captureScales.get(id) ?? output.scale, scale)
        );
      continue;
    }
    result.push({ clipId: layer.clipId, sourceSize, demands, sourceRasterScale, captureScales });
  }
  if (
    frame.camera.spatial &&
    args.captureRasterScales === undefined &&
    frame.visualLayers.some(
      (layer) =>
        layer.kind === 'video' &&
        admittedVisualWindowHeader(layer.clip, args.images ?? {}, layer.trackRole === 'CAMERA')
          .windowHeaderImage
    )
  ) {
    const scales = new Map<string, number>();
    for (const plan of result)
      for (const [id, scale] of plan.captureScales)
        scales.set(id, Math.max(scales.get(id) ?? output.scale, scale));
    return resolveNativeSourceSamplingDemands({ ...args, captureRasterScales: scales });
  }
  return result;
}
/** Unknown temporal geometry can never authorize bypass of the selected export sampler. */
export function classifyNativeExportSamplingDemand(
  project: VideoProject,
  settings: VideoProjectExportSettings,
  range = resolveProjectExportRange(project, settings)
): 'none' | 'growth' | 'unknown' {
  if (parseEnhancementMode(settings.detailEnhancement) === 'off') return 'none';
  if (
    project.motionRegions?.length ||
    project.transitions?.length ||
    project.actionFeedback?.length ||
    project.actionEvents.length ||
    project.effectInstances?.some((e) => e.enabled)
  )
    return 'unknown';
  try {
    for (const clip of project.clips) {
      if (
        clip.type !== 'VIDEO' ||
        clip.startTime >= range.end ||
        clip.startTime + clip.duration <= range.start
      )
        continue;
      if (
        clip.transitionIn !== 'NONE' ||
        clip.transitionOut !== 'NONE' ||
        clip.cameraPositions?.length ||
        clip.cameraHiddenRanges?.length ||
        clip.cameraTiming
      )
        return 'unknown';
      const time =
        (Math.max(range.start, clip.startTime) +
          Math.min(range.end, clip.startTime + clip.duration)) /
        2;
      const passes = resolveVideoCompositionRenderPasses(project, time);
      for (const frame of [passes.overlayFrame, ...passes.visualPasses.map((p) => p.frame)])
        if (
          hasMagnificationDemand(
            resolveNativeSourceSamplingDemands({ project, settings, frame, time }).flatMap(
              (p) => p.demands
            )
          )
        )
          return 'growth';
    }
    return 'none';
  } catch {
    return 'unknown';
  }
}
