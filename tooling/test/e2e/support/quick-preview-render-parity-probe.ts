import {
  createQuickEditBorder,
  createQuickEditSpotlight,
} from '../../../../apps/extension/src/features/video/project/scene/focus-appearance';
import { reviewWatermarkAssets } from '../../../../apps/extension/src/workflows/video-review/asset-bytes';
import { createPreviewRenderResources } from '../../../../apps/extension/src/workflows/video-review/preview-render-resources';
import {
  calculatePreviewRenderAllocation,
  resolvePreviewRenderAllocation,
  type PreviewRenderAllocationInput,
} from '../../../../apps/extension/src/workflows/video-review/preview-render-allocation';
import { createReviewSpatialSession } from '../../../../apps/extension/src/workflows/video-review/spatial-render-session';
import { drawReviewWebcam } from '../../../../apps/extension/src/workflows/video-review/render-webcam';
import { quickEditMotionBlurCameras } from '../../../../apps/extension/src/features/video/review/advanced/motion-blur';
import { DEFAULT_CAMERA_APPEARANCE } from '../../../../apps/extension/src/features/video/project/camera/appearance';
import { createReviewPreviewRenderer } from '../../../../apps/extension/src/workflows/video-review/render-preview';
import { drawReviewSceneFrame } from '../../../../apps/extension/src/workflows/video-review/scene-frame';
import { drawReviewSceneOverlays } from '../../../../apps/extension/src/workflows/video-review/render-scene-overlays';
import { drawReviewKeys } from '../../../../apps/extension/src/workflows/video-review/render-key-animation';
import { createWatermarkRenderer } from '../../../../apps/extension/src/features/video/composition/canvas/watermark';
import {
  loadReviewWindowHeader,
  reviewWindowHeaderUrl,
} from '../../../../apps/extension/src/workflows/video-review/window-header';
import {
  paintReviewCutTransition,
  paintReviewCutBlackout,
  paintReviewCutDissolve,
  reviewCutTransitionSides,
} from '../../../../apps/extension/src/workflows/video-review/cut-transition-frames';
import {
  computeQuickEditSceneLayout,
  evaluateQuickEditCameraAtTime,
} from '../../../../apps/extension/src/features/video/review/advanced/scene';
import { createCanvasComment } from '../../../../apps/extension/src/features/video/review/comments';
import { evaluateReviewClicks } from '../../../../apps/extension/src/features/video/review/click-animation';
import {
  planReviewPresentationSequence,
  presentationColorOpacity,
} from '../../../../apps/extension/src/features/video/review/presentation-sequence';
import { createNeutralPresentationSettings } from '../../../../apps/extension/src/features/video/review/advanced/presentation';

import { REVIEW_CLICK_DEFAULT } from '../../../../apps/extension/src/features/video/review/advanced/click-animation';
import { REVIEW_KEY_DEFAULT } from '../../../../apps/extension/src/features/video/project/action-feedback/key-animation';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import { reviewCutTransitionAt } from '../../../../apps/extension/src/features/video/review/cuts';
import type { RenderResources } from '../../../../apps/extension/src/features/video/composition/canvas/render-resources';

type Scene = Parameters<ReturnType<typeof createReviewPreviewRenderer>['prepare']>[0];
type Frame = Parameters<ReturnType<typeof createReviewPreviewRenderer>['render']>[1];
const size = { width: 640, height: 360 };
const time = 1.25;
type Layer =
  | 'background'
  | 'header'
  | 'shadow'
  | 'border'
  | 'spotlight'
  | 'comments'
  | 'clicks'
  | 'keys'
  | 'watermark'
  | 'cut';

function canvas(bounds = size) {
  return Object.assign(document.createElement('canvas'), bounds);
}
function owner() {
  let canvases = 0,
    bytes = 0;
  const resources: RenderResources = {
    canvas(_role, bounds, options) {
      const surface = document.createElement('canvas');
      surface.width = bounds.width;
      surface.height = bounds.height;
      const context = surface.getContext('2d', options);
      if (!context) throw new Error('Canvas unavailable');
      canvases++;
      let live = true;
      return {
        canvas: surface,
        context,
        release() {
          if (!live) return;
          live = false;
          canvases--;
          surface.width = surface.height = 0;
        },
      };
    },
    bytes(_role, count) {
      bytes += count;
      let live = true;
      return {
        release() {
          if (live) {
            live = false;
            bytes -= count;
          }
        },
      };
    },
  };
  return { resources, state: () => ({ canvases, bytes }) };
}
function fixture(omit?: Layer): Scene {
  const region = {
    start: 0,
    end: 3,
    transform: { scale: 1, centerX: 0.5, centerY: 0.5 },
    enter: { type: 'none' as const, duration: 0 },
    exit: { type: 'none' as const, duration: 0 },
  };
  return {
    source: size,
    background:
      omit === 'background'
        ? { enabled: false }
        : {
            enabled: true,
            type: 'solid',
            color: '#34637fff',
            layout: {
              padding: 32,
              cornerRadius: 14,
              ...(omit === 'shadow' ? {} : { shadow: { intensity: 80, color: '#000000cc' } }),
            },
          },
    ...(omit === 'header'
      ? {}
      : { windowHeader: { ...DEFAULT_WINDOW_HEADER, title: 'Parity', url: 'example.test' } }),
    zoomRegions: [
      ...(omit === 'border'
        ? []
        : [{ ...region, id: 'border', border: { ...createQuickEditBorder(), width: 6 } }]),
      ...(omit === 'spotlight'
        ? []
        : [
            {
              ...region,
              id: 'spotlight',
              spotlight: { ...createQuickEditSpotlight(), strength: 0.3 },
            },
          ]),
    ],
    comments:
      omit === 'comments'
        ? []
        : [
            {
              ...createCanvasComment({ id: 'content', at: 0, position: { x: 0.25, y: 0.35 } }),
              resolvedText: 'Content note',
            },
            {
              ...createCanvasComment({ id: 'viewport', at: 0, position: { x: 0.75, y: 0.25 } }),
              attachment: 'viewport',
              resolvedText: 'Viewport note',
            },
          ],
    clicks:
      omit === 'clicks'
        ? []
        : [
            {
              settings: {
                ...REVIEW_CLICK_DEFAULT,
                effect: 'press',
                color: '#ff00ffff',
                radius: 26,
              },
              point: { x: 0.7, y: 0.7 },
              anchor: 1,
              start: 0.8,
              end: 2,
            },
          ],
    keys:
      omit === 'keys'
        ? []
        : [
            {
              settings: { ...REVIEW_KEY_DEFAULT, enabled: true },
              label: 'Ctrl + K',
              start: 0,
              end: 3,
            },
          ],
    ...(omit === 'watermark'
      ? {}
      : {
          watermark: {
            mode: 'text',
            layout: 'single',
            text: {
              value: 'Parity mark',
              font: 'serif',
              weight: 'bold',
              size: 0.04,
              color: '#ffffffcc',
              align: 'center',
              shadow: true,
              wrapWidth: 0.3,
            },
            placement: { anchor: 'bottom-right', margin: 0.025 },
            tile: { spacing: 0.04, rotation: -30 },
          },
        }),
  };
}
function samples() {
  const source = canvas(),
    right = canvas();
  for (const [index, surface] of [source, right].entries()) {
    const context = surface.getContext('2d')!;
    context.fillStyle = index ? '#bd7033' : '#215e57';
    context.fillRect(0, 0, size.width, size.height);
    for (let x = 0; x < size.width; x += 17) {
      context.fillStyle = x % 2 ? '#f5e384' : '#648eca';
      context.fillRect(x, 0, 7, size.height);
    }
    context.fillStyle = index ? '#f19' : '#9ef';
    context.fillRect(60, 80, 180, 110);
  }
  const sample = (surface: HTMLCanvasElement, timestamp: number) => ({
    timestamp,
    draw: (target: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) =>
      target.drawImage(surface, x, y, width, height),
    close() {},
  });
  return {
    source: { ...sample(source, 0.95), backing: size },
    pair: { left: sample(source, 0.95), right: sample(right, 2.05) },
  };
}
function transition(
  type: 'dissolve' | 'fade-black',
  pair: ReturnType<typeof samples>['pair']
): NonNullable<Frame['transition']> {
  const blend = reviewCutTransitionAt(time, [
    {
      id: 'cut',
      type,
      seam: 1.5,
      before: 0.5,
      after: 0.5,
      left: { start: 0, end: 1 },
      right: { start: 2, end: 3 },
    },
  ]);
  if (!blend) throw new Error('Inactive cut fixture');
  return { blend, frames: pair };
}

/** Independent export ordering; no call to the prepared renderer or its request builder. */
async function reference(
  scene: Scene,
  frame: Frame,
  backing = size,
  finalDecorations = true,
  transparent = false
) {
  const output = canvas(backing),
    context = output.getContext('2d', { alpha: transparent })!;
  const camera = evaluateQuickEditCameraAtTime(scene.zoomRegions, frame.resultTime);
  const layout = computeQuickEditSceneLayout({
    output,
    source: size,
    background: scene.background,
    windowHeader: scene.windowHeader,
    camera,
  });
  const scale = backing.width / size.width;
  const canonicalLayout = computeQuickEditSceneLayout({
    output: size,
    source: size,
    background: scene.background,
    windowHeader: scene.windowHeader,
    camera,
  });
  const background = scene.background.enabled
    ? {
        ...scene.background,
        layout: {
          ...scene.background.layout,
          cornerRadius: scene.background.layout.cornerRadius * scale,
          ...(scene.background.layout.blur === undefined
            ? {}
            : { blur: scene.background.layout.blur * scale }),
        },
      }
    : scene.background;
  const spatial = layout.spatial ? createReviewSpatialSession() : undefined;
  const textOwner = owner();
  const signal = new AbortController().signal;
  const header = scene.windowHeader
    ? await loadReviewWindowHeader(
        reviewWindowHeaderUrl(scene.windowHeader, size.width, size.height),
        signal,
        {
          backing: {
            width: Math.max(1, Math.ceil(layout.windowRect.width)),
            height: Math.max(1, Math.ceil(layout.videoRect.y - layout.windowRect.y)),
          },
        }
      )
    : null;
  const watermark = await createWatermarkRenderer(
    scene.watermark,
    size,
    reviewWatermarkAssets(undefined),
    signal,
    scale === 1
      ? undefined
      : { scaleX: scale, scaleY: backing.height / size.height, resources: textOwner.resources }
  );
  const raster = canvas();
  const rasterContext = raster.getContext('2d')!;
  if (frame.transition)
    paintReviewCutTransition(
      rasterContext,
      raster,
      frame.transition.blend,
      frame.transition.frames,
      frame.source
    );
  else frame.source.draw(rasterContext, 0, 0, size.width, size.height);
  const drawScene = {
    canvas: output,
    layout,
    background,
    image: null,
    headerImage: header,
    sample: {
      draw: (
        target: CanvasRenderingContext2D,
        x: number,
        y: number,
        width: number,
        height: number
      ) => target.drawImage(raster, x, y, width, height),
    },
    comments: scene.comments,
    sourceTime: frame.sourceTime,
    cameraScale: camera.scale,
    sceneScale: scale,
    ...(scale === 1
      ? {}
      : {
          commentSpace: {
            canvas: size,
            layout: canonicalLayout,
            background: scene.background,
            cameraScale: camera.scale,
          },
        }),
  };
  try {
    if (frame.transition?.blend.plan.type === 'dissolve') {
      const { blend, frames, resultOffset } = frame.transition;
      const sides = reviewCutTransitionSides(
        blend,
        frames,
        frame.source,
        frame.resultTime,
        resultOffset
      );
      const endpoints = await Promise.all(
        sides.map((side, index) =>
          reference(
            scene,
            {
              ...frame,
              resultTime: side.resultTime,
              sourceTime: side.sample.timestamp,
              source: { ...side.sample, backing: size },
              transition: undefined,
            },
            backing,
            false,
            index === 1
          )
        )
      );
      const scratch = canvas(backing),
        scratchContext = scratch.getContext('2d')!;
      try {
        paintReviewCutDissolve(
          context,
          { canvas: scratch, context: scratchContext },
          blend.incoming,
          (target, _surface, index) => target.drawImage(endpoints[index]!, 0, 0),
          output
        );
      } finally {
        for (const endpoint of endpoints) endpoint.width = endpoint.height = 0;
        scratch.width = scratch.height = 0;
      }
    } else
      drawReviewSceneFrame(context, {
        ...drawScene,
        spatialRenderer: spatial,
        motionBlur: quickEditMotionBlurCameras(scene.zoomRegions, frame.resultTime),
        deferComments: true,
        windowRasterBacking: {
          width: Math.max(1, Math.ceil(layout.windowRect.width)),
          height: Math.max(1, Math.ceil(layout.windowRect.height)),
        },
        drawOverlays: (windowRaster) =>
          drawReviewSceneOverlays({
            scene: drawScene,
            renderer: spatial,
            context,
            canvas: output,
            spotlightScratch: null,
            regions: scene.zoomRegions,
            globalResultTime: frame.resultTime,
            cameraScale: camera.scale,
            sourceWidth: size.width,
            clicks: scene.clicks,
            windowRaster,
          }),
      });
    if (finalDecorations && scene.webcam && frame.camera)
      drawReviewWebcam(
        context,
        output,
        scene.webcam,
        frame.camera.placement,
        frame.camera.source,
        frame.camera.drawable,
        frame.camera.crop
      );
    if (finalDecorations) {
      context.save();
      context.scale(scale, backing.height / size.height);
      drawReviewKeys(context, scene.keys, frame.resultTime, size);
      watermark.draw(context);
      context.restore();
      paintReviewCutBlackout(context, output, frame.transition?.blend ?? null);
    }
    return output;
  } finally {
    header?.close();
    watermark.dispose();
    spatial?.dispose();
    raster.width = raster.height = 0;
  }
}
function compare(actual: HTMLCanvasElement, expected: HTMLCanvasElement) {
  const a = actual.getContext('2d')!.getImageData(0, 0, actual.width, actual.height).data;
  const e = expected.getContext('2d')!.getImageData(0, 0, expected.width, expected.height).data;
  let maxDifference = 0,
    differentPixels = 0;
  for (let i = 0; i < a.length; i += 4) {
    let different = false;
    for (let channel = 0; channel < 4; channel++) {
      const difference = Math.abs(a[i + channel]! - e[i + channel]!);
      maxDifference = Math.max(maxDifference, difference);
      different ||= difference !== 0;
    }
    if (different) differentPixels++;
  }
  return { maxDifference, differentPixels };
}

function comparePixels(actual: ImageData, expected: ImageData) {
  let maxDifference = 0,
    differentPixels = 0;
  for (let i = 0; i < actual.data.length; i += 4) {
    let different = false;
    for (let channel = 0; channel < 4; channel++) {
      const difference = Math.abs(actual.data[i + channel]! - expected.data[i + channel]!);
      maxDifference = Math.max(maxDifference, difference);
      different ||= difference !== 0;
    }
    if (different) differentPixels++;
  }
  return { maxDifference, differentPixels };
}
function show(name: string, expected: HTMLCanvasElement, actual: HTMLCanvasElement) {
  const row = document.createElement('div'),
    label = document.createElement('p');
  label.textContent = `${name}: export primitives / prepared preview`;
  row.append(label);
  for (const input of [expected, actual]) {
    const thumb = canvas();
    thumb.style.width = '320px';
    thumb.style.height = '180px';
    thumb.getContext('2d')!.drawImage(input, 0, 0, size.width, size.height);
    row.append(thumb);
  }
  document.body.append(row);
}

/** Real Chromium pixels, deterministic source images, and no encoder or product test hook. */
export async function probe() {
  const source = samples();
  const results = [];
  document.body.style.cssText = 'margin:8px;background:#ddd;font:12px sans-serif';
  for (const cut of [undefined, 'dissolve', 'fade-black'] as const) {
    const managed = owner(),
      renderer = createReviewPreviewRenderer({ resources: managed.resources });
    const scene = fixture();
    const frame: Frame = {
      generation: 1,
      sourceTime: 0.95,
      resultTime: time,
      source: source.source,
      ...(cut ? { transition: transition(cut, source.pair) } : {}),
    };
    const prepared = await renderer.prepare(
      scene,
      { canonical: size, backing: size },
      new AbortController().signal
    );
    const expected = await reference(scene, frame),
      actual = await renderer.render(prepared, frame);
    const parity = compare(actual.canvas, expected);
    show(cut ?? 'all layers', expected, actual.canvas);
    const witnesses: Record<string, number> = {};
    for (const layer of [
      'background',
      'header',
      'shadow',
      'border',
      'spotlight',
      'comments',
      'clicks',
      'keys',
      'watermark',
      ...(cut ? ['cut'] : []),
    ] as Layer[]) {
      const omitted = await reference(
        fixture(layer),
        layer === 'cut' ? { ...frame, transition: undefined } : frame
      );
      witnesses[layer] = compare(expected, omitted).differentPixels;
      omitted.width = omitted.height = 0;
    }
    actual.release();
    prepared.release();
    renderer.dispose();
    expected.width = expected.height = 0;
    results.push({ name: cut ?? 'all-layers', parity, witnesses, resources: managed.state() });
  }
  return [...results, ...(await advancedCases(source))];
}

type AdvancedOmission = 'perspective' | 'depth-of-field' | 'motion' | 'webcam' | 'comments';
function advancedFixture(omit?: AdvancedOmission): Scene {
  const scene = fixture();
  scene.zoomRegions = [
    ...scene.zoomRegions,
    {
      id: 'spatial-zoom',
      start: 0,
      end: 4,
      transform: { scale: 1.35, centerX: 0.58, centerY: 0.43 },
      enter: { type: 'linear', duration: 2 },
      exit: { type: 'none', duration: 0 },
      ...(omit === 'perspective'
        ? {}
        : { perspective: { enabled: true, rotateX: 12, rotateY: -18, rotateZ: 5, strength: 0.7 } }),
      ...(omit === 'depth-of-field'
        ? {}
        : {
            depthOfField: {
              enabled: true,
              mode: 'area',
              x: 0.45,
              y: 0.45,
              width: 0.2,
              softness: 0.25,
              strength: 0.8,
            },
          }),
      ...(omit === 'motion' ? {} : { motionBlur: { enter: { enabled: true, strength: 1 } } }),
    },
  ];
  if (omit !== 'webcam')
    scene.webcam = {
      assetId: 'fixture-camera',
      enabled: true,
      offsetSeconds: 0,
      mirrored: true,
      appearance: { ...DEFAULT_CAMERA_APPEARANCE, shape: 'circle' },
      placement: { x: 0.62, y: 0.62, width: 0.25, height: 0.3 },
      shadow: { intensity: 65, color: '#000000cc' },
      positions: [],
      hiddenRanges: [],
    };
  scene.comments = (omit === 'comments' ? [] : scene.comments).map((comment) => ({
    ...comment,
    resolvedText: 'Canonical comment wrapping stays stable across selected preview raster sizes.',
  }));
  return scene;
}
function representativeLedger(scene: Scene, backing: typeof size) {
  const resources = createPreviewRenderResources({ maximumManagedBytes: 1, maximumCanvases: 1 });
  const budgets: { maximumManagedBytes: number; maximumCanvases: number }[] = [];
  const layout = computeQuickEditSceneLayout({
    source: size,
    output: backing,
    background: scene.background,
    windowHeader: scene.windowHeader,
    camera: { scale: 1, centerX: 0.5, centerY: 0.5 },
  });
  let assets: PreviewRenderAllocationInput['assets'] = {
    backgroundBitmap: null,
    watermark: null,
    previousWatermarkCache: null,
    headerBitmap: scene.windowHeader
      ? {
          width: Math.max(1, Math.ceil(layout.windowRect.width)),
          height: Math.max(1, Math.ceil(layout.videoRect.y - layout.windowRect.y)),
        }
      : null,
  };
  let admitted = false;
  const describe = () => {
    const graph = resolvePreviewRenderAllocation({
      scene,
      dimensions: { canonical: size, backing },
      sourceTime: 0.95,
      resultTime: time,
      sourceAllocationBytes: null,
      sourceBacking: size,
      camera: { retainedBytes: null, activeBytes: null },
      transitionBytes: null,
      previousFront: null,
      assets,
    });
    if (admitted) {
      graph.admission.source = { kind: 'canvas', size };
      graph.admission.camera.active = { kind: 'canvas', size };
    }
    return graph;
  };
  const replaceLimits = (limits: { maximumManagedBytes: number; maximumCanvases: number }) => {
    resources.replaceLimits(limits);
    budgets.push({
      maximumManagedBytes: limits.maximumManagedBytes,
      maximumCanvases: limits.maximumCanvases,
    });
  };
  return {
    resources,
    allocation: { describe, replaceLimits },
    budgets,
    admit(prepared: { allocationAssets: PreviewRenderAllocationInput['assets'] }) {
      assets = prepared.allocationAssets;
      admitted = true;
      const graph = describe();
      replaceLimits(calculatePreviewRenderAllocation(graph));
      return graph.upperBounds;
    },
  };
}

async function advancedCases(source: ReturnType<typeof samples>) {
  const results = [];
  for (const backing of [size, { width: 320, height: 180 }]) {
    const scene = advancedFixture();
    const managed = representativeLedger(scene, backing),
      renderer = createReviewPreviewRenderer({
        resources: managed.resources,
        allocation: managed.allocation,
      });
    const frame: Frame = {
      generation: 2,
      sourceTime: 0.95,
      resultTime: time,
      source: source.source,
      camera: {
        generation: 2,
        representedMediaTime: 0.93,
        source: size,
        placement: scene.webcam!.placement,
        drawable: source.pair.right,
      },
    };
    const prepared = await renderer.prepare(
      scene,
      { canonical: size, backing },
      new AbortController().signal
    );
    const upperBounds = managed.admit(prepared);
    const sourceLease = managed.resources.canvas('probe-admitted-source', size);
    const cameraLease = managed.resources.canvas('probe-admitted-camera', size);
    source.source.draw(sourceLease.context, 0, 0, size.width, size.height);
    source.pair.right.draw(cameraLease.context, 0, 0, size.width, size.height);
    const drawable = (surface: HTMLCanvasElement) => ({
      draw: (
        context: CanvasRenderingContext2D,
        x: number,
        y: number,
        width: number,
        height: number
      ) => context.drawImage(surface, x, y, width, height),
    });
    const admittedFrame: Frame = {
      ...frame,
      source: { ...frame.source, ...drawable(sourceLease.canvas) },
      camera: { ...frame.camera!, drawable: drawable(cameraLease.canvas) },
    };
    const expected = await reference(scene, frame, backing),
      actual = await renderer.render(prepared, admittedFrame);
    const parity = compare(actual.canvas, expected);
    const name =
      backing.width === size.width ? 'spatial-motion-webcam' : 'reduced-spatial-canonical-text';
    show(name, expected, actual.canvas);
    const witnesses: Record<string, number> = {};
    for (const layer of [
      'perspective',
      'depth-of-field',
      'motion',
      'webcam',
      'comments',
    ] as const) {
      const omitted = await reference(advancedFixture(layer), frame, backing);
      witnesses[layer] = compare(expected, omitted).differentPixels;
      omitted.width = omitted.height = 0;
    }
    const exposureCount = quickEditMotionBlurCameras(scene.zoomRegions, time).length;
    const geometry = { backing, canonical: size, watermarkBounds: prepared.watermarkBounds };
    const peak = managed.resources.counters;
    const resourceEvidence = {
      backing,
      budgets: managed.budgets,
      upperBounds,
      peakManagedBytes: peak.peakManagedBytes,
      peakCanvasCount: peak.peakCanvasCount,
      managedBytesBeforeDispose: peak.managedBytes,
      canvasCountBeforeDispose: peak.canvasCount,
    };
    actual.release();
    sourceLease.release();
    cameraLease.release();
    prepared.release();
    renderer.dispose();
    managed.resources.dispose();
    expected.width = expected.height = 0;
    results.push({
      name,
      parity,
      witnesses,
      exposureCount,
      geometry,
      resourceEvidence,
      resources: {
        canvases: managed.resources.counters.canvasCount,
        bytes: managed.resources.counters.managedBytes,
      },
    });
  }
  return results;
}

const queueSize = { width: 840, height: 472 };
const queueTimes = [0.15, 1.25] as const;

function queueFixture(): Scene {
  const scene = fixture();
  scene.source = queueSize;
  scene.background = {
    enabled: true,
    type: 'image',
    assetId: 'queue-background',
    imageFit: 'cover',
    motion: { mode: 'drift', speed: 100, intensity: 100 },
    layout: { padding: 40, cornerRadius: 12 },
    zoomBehavior: 'window',
  };
  scene.zoomRegions = [
    ...scene.zoomRegions,
    {
      id: 'queue-spatial',
      start: 0,
      end: 1.5,
      transform: { scale: 1.35, centerX: 0.58, centerY: 0.43 },
      enter: { type: 'linear', duration: 1.5 },
      exit: { type: 'none', duration: 0 },
      perspective: { enabled: true, rotateX: 12, rotateY: -18, rotateZ: 5, strength: 0.7 },
    },
  ];
  scene.clicks = queueTimes.map((at, index) => ({
    settings: { ...REVIEW_CLICK_DEFAULT, effect: 'magnify', radius: 42, magnification: 1.8 },
    point: { x: index ? 0.7 : 0.3, y: index ? 0.7 : 0.4 },
    anchor: at - (index ? 0.15 : 0.05),
    start: at - 0.1,
    end: at + 0.4,
  }));
  const settings = createNeutralPresentationSettings();
  settings.fadeIn = { ...settings.fadeIn, enabled: true, duration: 0.4 };
  settings.fadeOut = { ...settings.fadeOut, enabled: true, duration: 0.4 };
  const plan = planReviewPresentationSequence({
    settings,
    mainDuration: 1.5,
    fragmentOffset: 0,
    includeBookends: true,
    rate: { numerator: 60, denominator: 1 },
  });
  if (!plan.ok) throw new Error('Queue fixture presentation is invalid');
  scene.outerFadePlan = plan.plan;
  return scene;
}

function queueLedger(
  scene: Scene,
  sourceBytes: number,
  outputKind: () => 'canvas2d' | 'gpu-surface' = () => 'canvas2d'
) {
  const ledger = createPreviewRenderResources({ maximumManagedBytes: 1, maximumCanvases: 1 });
  const budgets: { maximumManagedBytes: number; maximumCanvases: number }[] = [];
  let canvasLeases = 0,
    byteLeases = 0,
    publication2DAllocations = 0;
  const resources: RenderResources = {
    canvas(role, bounds, options) {
      const lease = ledger.canvas(role, bounds, options);
      if (role === 'preview-publication') publication2DAllocations++;
      canvasLeases++;
      let live = true;
      return {
        ...lease,
        release() {
          if (!live) return;
          live = false;
          canvasLeases--;
          lease.release();
        },
      };
    },
    bytes(role, count) {
      const lease = ledger.bytes(role, count);
      byteLeases++;
      let live = true;
      return {
        release() {
          if (!live) return;
          live = false;
          byteLeases--;
          lease.release();
        },
      };
    },
  };
  const layout = computeQuickEditSceneLayout({
    source: queueSize,
    output: queueSize,
    background: scene.background,
    windowHeader: scene.windowHeader,
    camera: { scale: 1, centerX: 0.5, centerY: 0.5 },
  });
  let assets: PreviewRenderAllocationInput['assets'] = {
    backgroundBitmap: queueSize,
    headerBitmap: {
      width: Math.max(1, Math.ceil(layout.windowRect.width)),
      height: Math.max(1, Math.ceil(layout.videoRect.y - layout.windowRect.y)),
    },
    watermark: null,
    previousWatermarkCache: null,
  };
  return {
    resources,
    ledger,
    budgets,
    state: () => ({ canvasLeases, byteLeases, publication2DAllocations, ...ledger.counters }),
    prepared(value: { allocationAssets: PreviewRenderAllocationInput['assets'] }) {
      assets = value.allocationAssets;
    },
    allocation: {
      describe() {
        return resolvePreviewRenderAllocation({
          scene,
          dimensions: { canonical: queueSize, backing: queueSize },
          maximumInFlight: 2,
          outputKind: outputKind(),
          sourceTime: queueTimes[0],
          resultTime: queueTimes[0],
          // Both caller-owned native frames remain retained throughout the comparison.
          sourceAllocationBytes: sourceBytes,
          sourceBacking: queueSize,
          camera: { retainedBytes: null, activeBytes: null },
          transitionBytes: null,
          previousFront: null,
          assets,
        });
      },
      replaceLimits(limits: { maximumManagedBytes: number; maximumCanvases: number }) {
        ledger.replaceLimits(limits);
        budgets.push({ ...limits });
      },
    },
  };
}

/** Compares one prepared production GPU queue with its own sequential full-image references. */
export async function probeGpuQueue() {
  return runGpuQueue();
}

/** Quality-only direct output proof; capture reads the browser compositor, never the GPU canvas. */
export async function probeGpuDirectQueue(capture: () => Promise<ImageData>) {
  return runGpuQueue(capture);
}

async function runGpuQueue(capture?: () => Promise<ImageData>) {
  type Renderer = ReturnType<typeof createReviewPreviewRenderer>;
  type Completed =
    | Awaited<ReturnType<Renderer['render']>>
    | Awaited<ReturnType<Renderer['renderPresentation']>>;
  const nativeFrames: VideoFrame[] = [],
    sourceReservations: { release(): void }[] = [],
    completed = new Set<Completed>(),
    rasters = new Set<HTMLCanvasElement>();
  const references: ImageData[] = [],
    renderFacts: {
      source: number;
      result: number;
      represented: number;
      gpu: boolean;
      cameraScale: number;
      spatial: boolean;
      direct: boolean;
    }[] = [];
  const featureStates: { time: number; lensScale: number; lensX: number; fadeOpacity: number }[] =
    [];
  let outputKind: 'canvas2d' | 'gpu-surface' = 'canvas2d';
  let outputLeases = 0,
    hiddenBeforePresent = 0,
    sourceHoldsBeforePresent = 0,
    publication2DAllocationsBeforeDirect = 0,
    direct2DPublications = 0,
    ringSurfaces = 0;
  const host = capture ? document.createElement('div') : null;
  if (host) {
    host.style.cssText =
      'position:fixed;left:0;top:0;width:840px;height:472px;background:black;z-index:2147483647';
    document.body.append(host);
  }
  let managed: ReturnType<typeof queueLedger> | null = null;
  let renderer: Renderer | null = null;
  let prepared: Awaited<ReturnType<Renderer['prepare']>> | null = null;
  let pending: Promise<Completed>[] = [];
  let stage = 0,
    code = 'OK',
    activeRequests = 0,
    peakRequests = 0,
    peakCompleted = 0,
    borrowedSources = 0,
    renderFailures = 0,
    cleanupErrors = 0,
    closedSources = 0,
    backgroundReads = 0;
  const parity: ReturnType<typeof comparePixels>[] = [];
  let referencesDifferentPixels = 0,
    distinctOutputs = false,
    sourcesStillOpen = false;
  let watermarkBounds = { x: 0, y: 0, width: 0, height: 0 };
  let beforeDispose: ReturnType<ReturnType<typeof queueLedger>['state']> | null = null;
  try {
    stage = 1;
    for (const [index, at] of queueTimes.entries()) {
      const surface = canvas(queueSize),
        context = surface.getContext('2d')!;
      rasters.add(surface);
      context.fillStyle = index ? '#a84327' : '#215e57';
      context.fillRect(0, 0, surface.width, surface.height);
      for (let x = 0; x < surface.width; x += 17) {
        context.fillStyle = x % 2 ? '#f5e384' : '#648eca';
        context.fillRect(x, 0, 7, surface.height);
      }
      nativeFrames.push(new VideoFrame(surface, { timestamp: Math.round(at * 1_000_000) }));
      surface.width = surface.height = 0;
      rasters.delete(surface);
    }
    const background = canvas(queueSize);
    rasters.add(background);
    const paint = background.getContext('2d')!;
    paint.fillStyle = '#184c96';
    paint.fillRect(0, 0, background.width, background.height);
    paint.fillStyle = '#f1a634';
    paint.fillRect(40, 30, 350, 260);
    const image = await new Promise<Blob>((resolve, reject) =>
      background.toBlob((blob) =>
        blob ? resolve(blob) : reject(new Error('Queue image unavailable'))
      )
    );
    background.width = background.height = 0;
    rasters.delete(background);
    const scene = queueFixture();
    for (const at of queueTimes) {
      const click = evaluateReviewClicks(scene.clicks, at).find((value) => value.lens);
      featureStates.push({
        time: at,
        lensScale: click?.lens?.scale ?? 0,
        lensX: click?.point.x ?? 0,
        fadeOpacity: presentationColorOpacity(scene.outerFadePlan!, Math.round(at * 1_000_000)),
      });
    }
    managed = queueLedger(
      scene,
      nativeFrames.reduce((sum, frame) => sum + frame.allocationSize(), 0),
      () => outputKind
    );
    renderer = createReviewPreviewRenderer({
      maximumInFlight: 2,
      renderer: 'gpu',
      resources: managed.resources,
      allocation: managed.allocation,
      readAsset: async (id) => {
        if (id !== 'queue-background') return null;
        backgroundReads++;
        return image;
      },
    });
    stage = 2;
    prepared = await renderer.prepare(
      scene,
      { canonical: queueSize, backing: queueSize },
      new AbortController().signal
    );
    managed.prepared(prepared);
    watermarkBounds = prepared.watermarkBounds;
    for (const frame of nativeFrames)
      sourceReservations.push(
        managed.resources.bytes('queue-probe-source', frame.allocationSize())
      );
    const frames: Frame[] = nativeFrames.map((native, index) => ({
      generation: 1,
      sourceTime: queueTimes[index]!,
      resultTime: queueTimes[index]!,
      source: {
        timestamp: native.timestamp / 1_000_000,
        backing: queueSize,
        videoFrame() {
          borrowedSources++;
          return native;
        },
        draw: (context, x, y, width, height) => context.drawImage(native, x, y, width, height),
      },
    }));
    const acquireOutput: Parameters<Renderer['renderPresentation']>[3] = (bounds, backend) => {
      if (!host || !managed) throw new Error('Direct output host is unavailable');
      const lease = managed.ledger.presentationCanvas(bounds, backend);
      lease.canvas.style.cssText =
        'position:absolute;left:0;top:0;width:840px;height:472px;opacity:0';
      host.append(lease.canvas);
      if (lease.canvas.isConnected && lease.canvas.style.opacity === '0') hiddenBeforePresent++;
      if (nativeFrames.every((frame) => frame.allocationSize() > 0)) sourceHoldsBeforePresent++;
      outputLeases++;
      let released = false;
      return {
        ...lease,
        release() {
          if (released) return;
          released = true;
          outputLeases--;
          lease.release();
        },
      };
    };
    const render = (frame: Frame, direct = false) => {
      activeRequests++;
      peakRequests = Math.max(peakRequests, activeRequests);
      const rendering = direct
        ? renderer!.renderPresentation(
            prepared!,
            frame,
            new AbortController().signal,
            acquireOutput
          )
        : renderer!.render(prepared!, frame);
      return rendering
        .then(
          (value) => {
            completed.add(value);
            peakCompleted = Math.max(peakCompleted, completed.size);
            renderFacts.push({
              source: value.sourceTime,
              result: value.resultTime,
              represented: value.representedMediaTime,
              gpu: value.renderer.backend === 'gpu',
              cameraScale: value.geometry?.camera.scale ?? 0,
              spatial: value.geometry?.camera.spatial !== undefined,
              direct: value.outputKind === 'gpu-surface',
            });
            return value;
          },
          (failure: unknown) => {
            renderFailures++;
            throw failure;
          }
        )
        .finally(() => activeRequests--);
    };
    const show = async (value: Completed) => {
      if (!host) return;
      if (value.canvas.parentElement !== host) host.append(value.canvas);
      value.canvas.style.cssText =
        'position:absolute;left:0;top:0;width:840px;height:472px;opacity:1';
      for (const child of host.children)
        if (child instanceof HTMLCanvasElement && child !== value.canvas) child.style.opacity = '0';
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
    };
    const pixels = async (value: Completed) => {
      if (value.canvas.width !== queueSize.width || value.canvas.height !== queueSize.height)
        throw new Error('Queue output dimensions changed');
      if (capture) {
        await show(value);
        return capture();
      }
      if (value.outputKind !== 'canvas2d') throw new Error('Queue bitmap context is unavailable');
      return value.context.getImageData(0, 0, queueSize.width, queueSize.height);
    };
    stage = 3;
    for (const frame of frames) {
      pending = [render(frame)];
      const value = await pending[0]!;
      references.push(await pixels(value));
      value.release();
      completed.delete(value);
    }
    referencesDifferentPixels = comparePixels(references[0]!, references[1]!).differentPixels;
    stage = 4;
    let front: Completed | null = null;
    if (capture) {
      outputKind = 'gpu-surface';
      publication2DAllocationsBeforeDirect = managed.state().publication2DAllocations;
      pending = [render(frames[0]!, true)];
      front = await pending[0]!;
      await show(front);
    }
    pending = frames.map((frame) => render(frame, !!capture));
    const results = await Promise.all(pending);
    distinctOutputs = results[0]!.canvas !== results[1]!.canvas;
    if (front) {
      ringSurfaces = new Set([front.canvas, ...results.map((value) => value.canvas)]).size;
      direct2DPublications =
        managed.state().publication2DAllocations - publication2DAllocationsBeforeDirect;
    }
    for (const [index, value] of results.entries())
      parity.push(comparePixels(await pixels(value), references[index]!));
    sourcesStillOpen = nativeFrames.every((frame) => frame.allocationSize() > 0);
  } catch {
    code = 'E_GPU_QUEUE_PROOF';
  } finally {
    await Promise.allSettled(pending);
    for (const value of completed) {
      try {
        value.release();
      } catch {
        cleanupErrors++;
      }
    }
    completed.clear();
    for (const reservation of sourceReservations) {
      try {
        reservation.release();
      } catch {
        cleanupErrors++;
      }
    }
    for (const frame of nativeFrames) {
      try {
        frame.close();
        closedSources++;
      } catch {
        cleanupErrors++;
      }
    }
    for (const raster of rasters) {
      raster.width = raster.height = 0;
    }
    rasters.clear();
    try {
      prepared?.release();
    } catch {
      cleanupErrors++;
    }
    try {
      renderer?.dispose();
    } catch {
      cleanupErrors++;
    }
    beforeDispose = managed?.state() ?? null;
    try {
      managed?.ledger.dispose();
    } catch {
      cleanupErrors++;
    }
    host?.remove();
  }
  return {
    code,
    directProof: !!capture,
    outputLeases,
    hiddenBeforePresent,
    sourceHoldsBeforePresent,
    direct2DPublications,
    ringSurfaces,
    stage,
    size: queueSize,
    timestamps: [...queueTimes],
    renderFacts,
    parity,
    featureStates,
    referencesDifferentPixels,
    distinctOutputs,
    peakRequests,
    peakCompleted,
    borrowedSources,
    ownedSourceFrames: nativeFrames.length,
    closedSources,
    sourcesStillOpen,
    referenceImageBytes: references.reduce((sum, image) => sum + image.data.byteLength, 0),
    backgroundReads,
    watermarkBounds,
    renderFailures,
    cleanupErrors,
    activeRequests,
    outstandingCompleted: completed.size,
    beforeDispose,
    resources: managed?.state() ?? null,
    budgets: managed?.budgets ?? [],
  };
}
