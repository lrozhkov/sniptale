import { createPreviewRenderResources } from '../../../../apps/extension/src/workflows/video-review/preview-render-resources';
import {
  calculatePreviewRenderAllocation,
  resolvePreviewRenderAllocation,
  type PreviewRenderAllocationInput,
} from '../../../../apps/extension/src/workflows/video-review/preview-render-allocation';
import { createReviewSpatialRenderer } from '../../../../apps/extension/src/workflows/video-review/spatial-renderer';
import { drawReviewWebcam } from '../../../../apps/extension/src/workflows/video-review/render-webcam';
import { quickEditMotionBlurCameras } from '../../../../apps/extension/src/features/video/review/advanced/motion-blur';
import { DEFAULT_CAMERA_APPEARANCE } from '../../../../apps/extension/src/features/video/project/camera/appearance';
import { createReviewPreviewRenderer } from '../../../../apps/extension/src/workflows/video-review/render-preview';
import { drawReviewSceneFrame } from '../../../../apps/extension/src/workflows/video-review/scene-frame';
import { drawReviewSceneOverlays } from '../../../../apps/extension/src/workflows/video-review/render-scene-overlays';
import { drawReviewKeys } from '../../../../apps/extension/src/workflows/video-review/render-key-animation';
import { createReviewWatermarkRenderer } from '../../../../apps/extension/src/workflows/video-review/render-watermark';
import {
  loadReviewWindowHeader,
  reviewWindowHeaderUrl,
} from '../../../../apps/extension/src/workflows/video-review/window-header';
import {
  paintReviewCutTransition,
  paintReviewCutBlackout,
} from '../../../../apps/extension/src/workflows/video-review/cut-transition-frames';
import {
  computeQuickEditSceneLayout,
  evaluateQuickEditCameraAtTime,
} from '../../../../apps/extension/src/features/video/review/advanced/scene';
import { createCanvasComment } from '../../../../apps/extension/src/features/video/review/comments';
import { createQuickEditBorder } from '../../../../apps/extension/src/features/video/review/advanced/border';
import { createQuickEditSpotlight } from '../../../../apps/extension/src/features/video/review/advanced/focus';
import { REVIEW_CLICK_DEFAULT } from '../../../../apps/extension/src/features/video/review/advanced/click-animation';
import { REVIEW_KEY_DEFAULT } from '../../../../apps/extension/src/features/video/review/advanced/key-animation';
import { DEFAULT_WINDOW_HEADER } from '../../../../apps/extension/src/features/browser-frame/header';
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
async function reference(scene: Scene, frame: Frame, backing = size) {
  const output = canvas(backing),
    context = output.getContext('2d', { alpha: false })!;
  const camera = evaluateQuickEditCameraAtTime(scene.zoomRegions, time);
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
  const spatial = layout.spatial ? createReviewSpatialRenderer() : undefined;
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
  const watermark = await createReviewWatermarkRenderer(
    scene.watermark,
    size,
    signal,
    undefined,
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
    drawReviewSceneFrame(context, {
      ...drawScene,
      spatialRenderer: spatial,
      motionBlur: quickEditMotionBlurCameras(scene.zoomRegions, time),
      deferComments: true,
      windowRasterBacking: {
        width: Math.max(1, Math.ceil(layout.windowRect.width)),
        height: Math.max(1, Math.ceil(layout.windowRect.height)),
      },
    });
    drawReviewSceneOverlays({
      scene: drawScene,
      renderer: spatial,
      context,
      canvas: output,
      spotlightScratch: null,
      regions: scene.zoomRegions,
      globalResultTime: time,
      cameraScale: camera.scale,
      sourceWidth: size.width,
      clicks: scene.clicks,
    });
    if (scene.webcam && frame.camera)
      drawReviewWebcam(
        context,
        output,
        scene.webcam,
        frame.camera.placement,
        frame.camera.source,
        frame.camera.drawable,
        frame.camera.crop
      );
    context.save();
    context.scale(scale, backing.height / size.height);
    drawReviewKeys(context, scene.keys, time, size);
    watermark.draw(context);
    context.restore();
    paintReviewCutBlackout(context, output, frame.transition?.blend ?? null);
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
      actual = renderer.render(prepared, frame);
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
      actual = renderer.render(prepared, admittedFrame);
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
