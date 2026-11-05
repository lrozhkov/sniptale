import { DEFAULT_WINDOW_HEADER } from '../../../packages/runtime-contracts/src/window-header';
import { createReviewGpuPreview } from '../../../apps/extension/src/workflows/video-review/gpu-preview';
import {
  reviewPresentedGeometry,
  reviewGpuSourcePlane,
} from '../../../apps/extension/src/workflows/video-review/gpu-preview-geometry';
import { createReviewBackgroundPainter } from '../../../apps/extension/src/workflows/video-review/scene-background';
import {
  reviewWindowHeaderUrl,
  loadReviewWindowHeader,
} from '../../../apps/extension/src/workflows/video-review/window-header';
import { createQuickEditZoomRegion } from '../../../apps/extension/src/features/video/review/advanced/zoom';
import { computeQuickEditSceneLayout } from '../../../apps/extension/src/features/video/review/advanced/scene';
import {
  DEFAULT_CAMERA_PERSPECTIVE,
  DEFAULT_CAMERA_DEPTH,
} from '../../../apps/extension/src/features/video/project/motion/spatial';
import { createNativeGpuPreviewRenderer } from '../../../apps/extension/src/video-editor/preview/stage/scene/gpu-preview';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../apps/extension/src/features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../apps/extension/src/features/video/project/factories/clip';
import { VideoProjectAssetType } from '../../../apps/extension/src/features/video/project/types';
import { createVideoProjectMotionRegion } from '../../../apps/extension/src/features/video/project/motion';
import { resolveVideoCompositionRenderPasses } from '../../../apps/extension/src/features/video/composition/timeline/render';
import { motionCameraProjection } from '../../../apps/extension/src/features/video/composition/motion/spatial';
import {
  projectQuickEditPoint,
  invertQuickEditProjection,
  multiplyQuickEditProjections,
} from '../../../apps/extension/src/features/video/composition/motion/spatial-geometry';
import {
  projectWindowHeaderImages,
  windowHeaderImageKey,
  admittedVisualWindowHeader,
} from '../../../apps/extension/src/features/video/composition/draw/window-header';
import {
  getFittedMediaContentFrame,
  getFittedMediaWindowFrame,
} from '../../../apps/extension/src/features/video/composition/draw/fitted-media';
import {
  createGpuPreviewRenderer,
  type GpuPreviewLayer,
} from '../../../apps/extension/src/features/video/composition/canvas/gpu-preview';
import type { RenderResources } from '../../../apps/extension/src/features/video/composition/canvas/render-resources';
import type { QuickEditHomography } from '../../../apps/extension/src/features/video/composition/motion/spatial-geometry';
import type { PreviewScene } from '../../../apps/extension/src/workflows/video-review/preview-scene';
import type { PreviewSceneRenderInput } from '../../../apps/extension/src/video-editor/preview/stage/scene/types';

type NativeVariant = 'direct' | 'orientation' | 'depth' | 'crop-orientation' | 'crop-inner';
interface JoinRegion {
  name: 'internal-join' | 'header-interior' | 'video-interior';
  exteriorExcludedPixels: number;
  pixels: number;
  changedPixels: number;
  maxBackdropDifference: number;
}
interface ColorRegion {
  name: 'header-source-invariance' | 'video-color' | 'alternate-video-color';
  pixels: number;
  wrongPixels: number;
  maxExpectedDifference: number;
}
interface HeaderAlpha {
  minimum: number;
  maximum: number;
  joinMinimum: number;
  joinMaximum: number;
  samples: number;
}
export interface GpuWindowJoinReport {
  rows: Array<{
    editor: 'Gallery' | 'Native';
    variant: 'direct' | NativeVariant;
    activeDepth: boolean;
    activeCrop: boolean;
    activeOrientation: boolean;
    activeInnerTransform: boolean;
    uploadedHeaderAlpha: HeaderAlpha | null;
    headerUploads: number;
    maxHeaderSourcesPerRender: number;
    logicalJoin?: { x: number; y: number; width: number };
    fixedWindow?: { x: number; y: number; width: number; height: number };
    transformedJoinMidpoint?: { x: number; y: number } | null;
    exteriorMargin?: number;
    metrics: JoinRegion[];
    colors: ColorRegion[];
    headerAlpha: HeaderAlpha;
    headerWidth: number;
    headerHeight: number;
  }>;
  sampler: Array<{
    filtered: boolean;
    edgeDifference: number;
    interiorAlpha: number;
    edgeAlpha: number;
    exteriorAlpha: number;
    clippedAlpha: number;
    hardClipAlpha: number;
  }>;
}
declare global {
  interface Window {
    gpuWindowJoinFixture?: { run(): Promise<GpuWindowJoinReport> };
  }
}

const output = { width: 1100, height: 720 };
const sourceSize = { width: 931, height: 520 };
const header = { ...DEFAULT_WINDOW_HEADER, title: 'Opaque seam', url: '' };
const perspective = {
  ...DEFAULT_CAMERA_PERSPECTIVE,
  enabled: true,
  rotateX: 11.3,
  rotateY: -17.4,
  rotateZ: 5.7,
  strength: 0.71,
};
const pose = { scale: 1.173, centerX: 0.53, centerY: 0.47, perspective };
const backdrops = ['#000000', '#ffffff'] as const;
function canvas(size = output) {
  return Object.assign(document.createElement('canvas'), size);
}
function context2d(target: HTMLCanvasElement) {
  const context = target.getContext('2d');
  if (!context) throw new Error('E_JOIN_2D_CONTEXT');
  return context;
}
const resources: RenderResources = {
  canvas(_role, size) {
    const target = canvas(size);
    return {
      canvas: target,
      context: context2d(target),
      release() {
        target.width = target.height = 0;
      },
    };
  },
  bytes() {
    return { release() {} };
  },
};
function pixels(target: HTMLCanvasElement) {
  return context2d(target).getImageData(0, 0, target.width, target.height).data;
}
function headerAlpha(source: CanvasImageSource, width: number, height: number): HeaderAlpha {
  const target = canvas({ width, height });
  const context = context2d(target);
  context.drawImage(source, 0, 0);
  const data = pixels(target);
  let minimum = 255,
    maximum = 0,
    joinMinimum = 255,
    joinMaximum = 0,
    samples = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3]!;
      minimum = Math.min(minimum, alpha);
      maximum = Math.max(maximum, alpha);
      if (y === height - 1 && x >= 24 && x < width - 24) {
        joinMinimum = Math.min(joinMinimum, alpha);
        joinMaximum = Math.max(joinMaximum, alpha);
        samples++;
      }
    }
  target.width = target.height = 0;
  return { minimum, maximum, joinMinimum, joinMaximum, samples };
}
function insideRoundedWindow(
  point: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number },
  radius: number,
  margin: number
) {
  const r = Math.min(radius, rect.width / 2, rect.height / 2);
  const dx = Math.abs(point.x - rect.x - rect.width / 2) - (rect.width / 2 - r);
  const dy = Math.abs(point.y - rect.y - rect.height / 2) - (rect.height / 2 - r);
  return (
    Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r <= -margin
  );
}
function compare(
  dark: Uint8ClampedArray,
  light: Uint8ClampedArray,
  inverse: QuickEditHomography,
  join: { x: number; y: number; width: number },
  visibility?: {
    inverse: QuickEditHomography;
    rect: { x: number; y: number; width: number; height: number };
    radius: number;
  }
): JoinRegion[] {
  const regions = [
    { name: 'internal-join', dy: 0 },
    { name: 'header-interior', dy: -12 },
    { name: 'video-interior', dy: 12 },
  ] as const;
  return regions.map(({ name, dy }) => {
    let exteriorExcludedPixels = 0;
    let count = 0,
      changedPixels = 0,
      maxBackdropDifference = 0;
    for (let y = 0; y < output.height; y++)
      for (let x = 0; x < output.width; x++) {
        const point = projectQuickEditPoint(inverse, { x: x + 0.5, y: y + 0.5 });
        if (
          !point ||
          point.x < join.x + 24 ||
          point.x > join.x + join.width - 24 ||
          Math.abs(point.y - join.y - dy) > 2
        )
          continue;
        if (visibility) {
          const fixed = projectQuickEditPoint(visibility.inverse, { x: x + 0.5, y: y + 0.5 });
          if (!fixed || !insideRoundedWindow(fixed, visibility.rect, visibility.radius, 2)) {
            exteriorExcludedPixels++;
            continue;
          }
        }
        const offset = (y * output.width + x) * 4;
        let delta = 0;
        for (let channel = 0; channel < 3; channel++)
          delta = Math.max(delta, Math.abs(dark[offset + channel]! - light[offset + channel]!));
        count++;
        if (delta > 1) changedPixels++;
        maxBackdropDifference = Math.max(maxBackdropDifference, delta);
      }
    if (count === 0) throw new Error('E_JOIN_EMPTY_ROI');
    return { name, pixels: count, changedPixels, maxBackdropDifference, exteriorExcludedPixels };
  });
}
function compareJoinColors(
  images: readonly Uint8ClampedArray[],
  inverse: QuickEditHomography,
  join: { x: number; y: number; width: number },
  visibility: {
    inverse: QuickEditHomography;
    rect: { x: number; y: number; width: number; height: number };
    radius: number;
  }
): ColorRegion[] {
  const regions = [
    { name: 'header-source-invariance', offset: -3, expected: null, images: [1, 2] },
    { name: 'video-color', offset: 3, expected: [219, 220, 221], images: [0, 1] },
    { name: 'alternate-video-color', offset: 3, expected: [40, 71, 188], images: [2] },
  ] as const;
  return regions.map(({ name, offset, expected, images: indices }) => {
    let count = 0,
      wrongPixels = 0,
      maxExpectedDifference = 0;
    for (let y = 0; y < output.height; y++)
      for (let x = 0; x < output.width; x++) {
        const point = projectQuickEditPoint(inverse, { x: x + 0.5, y: y + 0.5 });
        if (
          !point ||
          point.x < join.x + 24 ||
          point.x > join.x + join.width - 24 ||
          Math.abs(point.y - join.y - offset) > 0.5
        )
          continue;
        const fixed = projectQuickEditPoint(visibility.inverse, { x: x + 0.5, y: y + 0.5 });
        if (!fixed || !insideRoundedWindow(fixed, visibility.rect, visibility.radius, 2)) continue;
        let difference = 0;
        const pixel = (y * output.width + x) * 4;
        if (expected === null) {
          for (let channel = 0; channel < 3; channel++)
            difference = Math.max(
              difference,
              Math.abs(images[1]![pixel + channel]! - images[2]![pixel + channel]!)
            );
        } else
          for (const index of indices)
            for (let channel = 0; channel < 3; channel++)
              difference = Math.max(
                difference,
                Math.abs(images[index]![pixel + channel]! - expected[channel]!)
              );
        count++;
        if (difference > 1) wrongPixels++;
        maxExpectedDifference = Math.max(maxExpectedDifference, difference);
      }
    if (!count) throw new Error('E_JOIN_EMPTY_COLOR_ROI');
    return { name, pixels: count, wrongPixels, maxExpectedDifference };
  });
}

function background(color: string) {
  return {
    enabled: true,
    type: 'solid',
    color,
    zoomBehavior: 'window',
    layout: { padding: 40.13, cornerRadius: 18, shadow: { intensity: 0, color: '#000000' } },
  } as const;
}
function scene(): PreviewScene {
  return {
    source: sourceSize,
    canvas: output,
    windowHeader: header,
    background: background('#000000'),
    zoomRegions: [
      {
        ...createQuickEditZoomRegion({ id: 'pose', at: 0, duration: 8 }),
        transform: { scale: pose.scale, centerX: pose.centerX, centerY: pose.centerY },
        perspective,
        enter: { type: 'none', duration: 0 },
        exit: { type: 'none', duration: 0 },
      },
    ],
    comments: [],
    keys: [],
    clicks: [],
  };
}
async function galleryJoin(
  source: HTMLCanvasElement
): Promise<GpuWindowJoinReport['rows'][number]> {
  const signal = new AbortController().signal;
  const bitmapHeader = await loadReviewWindowHeader(
    reviewWindowHeaderUrl(header, source.width, source.height),
    signal
  );
  const owner = createReviewGpuPreview({ resources, reserve: () => ({ release() {} }) });
  const painter = createReviewBackgroundPainter(resources);
  const frame = new VideoFrame(source, { timestamp: 1_000_000 });
  const dimensions = { canonical: output, backing: output };
  const geometry = reviewPresentedGeometry(
    { ...scene(), background: background('#000000') },
    dimensions,
    1
  );
  const images: Uint8ClampedArray[] = [];
  try {
    for (const color of backdrops) {
      const target = canvas();
      const ok = await owner.render({
        scene: { ...scene(), background: background(color) },
        dimensions,
        geometry,
        frame,
        sourceTime: 1,
        context: context2d(target),
        header: bitmapHeader,
        image: null,
        painter,
        captions: null,
        signal,
      });
      if (!ok) throw new Error('E_JOIN_GALLERY_GPU');
      images.push(pixels(target));
      target.width = target.height = 0;
    }
    const plane = reviewGpuSourcePlane(geometry.layout, background('#000000'));
    return {
      editor: 'Gallery',
      colors: [],
      variant: 'direct',
      activeDepth: false,
      activeCrop: false,
      activeOrientation: false,
      activeInnerTransform: false,
      uploadedHeaderAlpha: null,
      headerUploads: 0,
      maxHeaderSourcesPerRender: 0,
      metrics: compare(images[0]!, images[1]!, plane.outerInverse, {
        x: plane.header.x,
        y: plane.header.y + plane.header.height,
        width: plane.header.width,
      }),
      headerAlpha: headerAlpha(bitmapHeader, bitmapHeader.width, bitmapHeader.height),
      headerWidth: bitmapHeader.width,
      headerHeight: bitmapHeader.height,
    };
  } finally {
    frame.close();
    owner.dispose();
    painter.dispose();
    bitmapHeader.close();
  }
}
async function prepareNativeJoin(variant: NativeVariant) {
  const neutral = computeQuickEditSceneLayout({
    ...scene(),
    background: background('#000000'),
    output,
    camera: { scale: 1, centerX: 0.5, centerY: 0.5 },
  });
  const project = createEmptyVideoProject('GPU join', output.width, output.height);
  const asset = createVideoProjectAsset(
    'Opaque source',
    VideoProjectAssetType.VIDEO,
    { kind: 'project-asset', projectAssetId: 'opaque' },
    {
      ...sourceSize,
      duration: 8,
      mimeType: 'video/webm',
      size: 1,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  const track = project.tracks[0];
  if (!track) throw new Error('E_JOIN_TRACK');
  const clip = createVideoClipFromAsset(track.id, asset, output.width, output.height, 0);
  clip.windowHeader = header;
  if (variant === 'crop-orientation' || variant === 'crop-inner')
    clip.sourceCrop = { x: 0.07, y: 0.06, width: 0.86, height: 0.88 };
  clip.windowCornerRadius = 18;
  clip.shadowIntensity = 0;
  clip.transform = { ...clip.transform, ...neutral.windowRect, rotation: 0, opacity: 1 };
  project.assets = [asset];
  project.clips = [clip];
  project.duration = 8;
  project.motionRegions = [
    {
      ...createVideoProjectMotionRegion(project, 0),
      duration: 8,
      zoomInDuration: 0,
      zoomOutDuration: 0,
      scale: pose.scale,
      focusPoint: {
        x: output.width * pose.centerX,
        y: output.height * (variant === 'crop-inner' ? 0.1 : pose.centerY),
      },
      perspective,
      ...(variant === 'depth'
        ? { depthOfField: { ...DEFAULT_CAMERA_DEPTH, enabled: true, mode: 'area', strength: 0.45 } }
        : {}),
      ...(variant === 'crop-inner'
        ? {
            sourceBinding: {
              clipId: clip.id,
              coordinateSpace: 'source-window',
              sourceStart: 0,
              sourceEnd: 8,
              animation: { start: 0, end: 8, duration: 8 },
            },
          }
        : {}),
    },
  ];
  const request = projectWindowHeaderImages(project)[0];
  if (!request || request.key !== windowHeaderImageKey(clip.id, header))
    throw new Error('E_JOIN_HEADER_KEY');
  const headerImage = new Image();
  await new Promise<void>((resolve, reject) => {
    headerImage.onload = () => resolve();
    headerImage.onerror = () => reject(new Error('E_JOIN_HEADER_IMAGE'));
    headerImage.src = request.src;
  });
  const imageBank = { [request.key]: headerImage };
  return { project, clip, headerImage, imageBank };
}

function observeHeaderUploads(header: HTMLImageElement) {
  const original = GPUQueue.prototype.copyExternalImageToTexture;
  let uploadedHeaderAlpha: HeaderAlpha | null = null,
    headerUploads = 0,
    maxHeaderSourcesPerRender = 0;
  const sources = new Set<HTMLCanvasElement>();
  GPUQueue.prototype.copyExternalImageToTexture = function (source, destination, size) {
    const image = source.source;
    if (
      image instanceof HTMLCanvasElement &&
      image.width === header.naturalWidth &&
      image.height === header.naturalHeight
    ) {
      sources.add(image);
      maxHeaderSourcesPerRender = Math.max(maxHeaderSourcesPerRender, sources.size);
      uploadedHeaderAlpha = headerAlpha(image, image.width, image.height);
      headerUploads++;
    }
    return original.call(this, source, destination, size);
  };
  return {
    beginRender() {
      sources.clear();
    },
    result() {
      return { uploadedHeaderAlpha, headerUploads, maxHeaderSourcesPerRender };
    },
    restore() {
      GPUQueue.prototype.copyExternalImageToTexture = original;
      sources.clear();
    },
  };
}

function nativeJoinGeometry(
  {
    project,
    clip,
    imageBank,
  }: Pick<Awaited<ReturnType<typeof prepareNativeJoin>>, 'project' | 'clip' | 'imageBank'>,
  source: { width: number; height: number }
) {
  const passes = resolveVideoCompositionRenderPasses(project, 1);
  const layer = passes.overlayFrame.visualLayers[0];
  if (layer?.kind !== 'video') throw new Error('E_JOIN_VIDEO_LAYER');
  const fitted = {
    frame: layer,
    fitMode: clip.fitMode,
    sourceWidth: source.width,
    sourceHeight: source.height,
    displayScale: 1,
    ...(clip.sourceCrop ? { sourceCrop: clip.sourceCrop } : {}),
    ...admittedVisualWindowHeader(clip, imageBank, false),
  };
  const content = getFittedMediaContentFrame(fitted);
  const crop = clip.sourceCrop;
  const visible = {
    x: content.x + content.width * (crop?.x ?? 0),
    y: content.y + content.height * (crop?.y ?? 0),
    width: content.width * (crop?.width ?? 1),
  };
  const fixedWindow = getFittedMediaWindowFrame(fitted);
  const projection = motionCameraProjection(passes.overlayFrame.camera);
  const inner = layer.sourceContentTransform;
  const inverse =
    projection &&
    invertQuickEditProjection(inner ? multiplyQuickEditProjections(projection, inner) : projection);
  const outerInverse = projection && invertQuickEditProjection(projection);
  if (!inverse || !outerInverse) throw new Error('E_JOIN_NATIVE_PROJECTION');
  const activeDepth =
    passes.overlayFrame.camera.spatial?.focus.some(
      (f) => f.settings.enabled && f.settings.strength > 0 && f.weight > 0
    ) === true;
  const activeInnerTransform =
    !!inner && inner.some((value, index) => value !== [1, 0, 0, 0, 1, 0, 0, 0, 1][index]);
  const midpoint = { x: visible.x + visible.width / 2, y: visible.y };
  return {
    visible,
    fixedWindow,
    inverse,
    outerInverse,
    activeDepth,
    activeInnerTransform,
    transformedJoinMidpoint: inner ? projectQuickEditPoint(inner, midpoint) : midpoint,
  };
}

async function nativeJoin(
  source: HTMLCanvasElement,
  variant: NativeVariant
): Promise<GpuWindowJoinReport['rows'][number]> {
  const { project, clip, headerImage, imageBank } = await prepareNativeJoin(variant);
  const owner = createNativeGpuPreviewRenderer();
  const images: Uint8ClampedArray[] = [];
  if (variant === 'crop-inner')
    project.sceneBackground = { kind: 'solid', color: '#000000', zoomBehavior: 'content' };
  const geometry = nativeJoinGeometry({ project, clip, imageBank }, source);
  const { visible, fixedWindow, inverse, outerInverse } = geometry;
  const sourceOrientation: GpuPreviewLayer['orientation'] =
    variant === 'orientation' || variant === 'crop-orientation'
      ? { rotation: 90, flip: true }
      : undefined;
  const uploads = observeHeaderUploads(headerImage);
  const renderBackdrops =
    variant === 'crop-orientation' || variant === 'crop-inner'
      ? [...backdrops, '#ffffff']
      : backdrops;
  try {
    for (const [index, color] of renderBackdrops.entries()) {
      if (index === 2) {
        const context = context2d(source);
        context.fillStyle = '#2847bc';
        context.fillRect(0, 0, source.width, source.height);
      }
      uploads.beginRender();
      project.backgroundColor = color;
      project.sceneBackground = {
        kind: 'solid',
        color,
        ...(variant === 'crop-inner' ? { zoomBehavior: 'content' } : {}),
      };
      const target = canvas();
      Object.defineProperties(target, {
        clientWidth: { value: output.width },
        clientHeight: { value: output.height },
      });
      const input: PreviewSceneRenderInput = {
        project,
        currentTime: 1,
        canvas: target,
        stage: null,
        imageBank,
        videoRefs: { current: {} },
        decodedVideoFrames: new Map([
          [
            clip.id,
            {
              sourceWidth: source.width,
              sourceHeight: source.height,
              ...(sourceOrientation ? { orientation: sourceOrientation } : {}),
              toVideoFrame: () => new VideoFrame(source, { timestamp: 1_000_000 }),
              draw: (context, x, y, width, height) =>
                context.drawImage(source, x, y, width, height),
            },
          ],
        ]),
      };
      if (
        (await owner.render(
          input,
          resolveVideoCompositionRenderPasses(project, 1),
          () => {},
          () => false,
          undefined,
          false
        )) !== true
      )
        throw new Error('E_JOIN_NATIVE_GPU');
      images.push(pixels(target));
      target.width = target.height = 0;
    }
    return {
      editor: 'Native',
      colors:
        variant === 'crop-orientation' || variant === 'crop-inner'
          ? compareJoinColors(images, inverse, visible, {
              inverse: outerInverse,
              rect: fixedWindow,
              radius: clip.windowCornerRadius ?? 0,
            })
          : [],
      variant,
      activeDepth: geometry.activeDepth,
      activeCrop: !!clip.sourceCrop,
      activeOrientation: variant === 'orientation' || variant === 'crop-orientation',
      activeInnerTransform: geometry.activeInnerTransform,
      ...uploads.result(),
      logicalJoin: visible,
      fixedWindow,
      exteriorMargin: 2,
      transformedJoinMidpoint: geometry.transformedJoinMidpoint,
      metrics: compare(images[0]!, images[1]!, inverse, visible, {
        inverse: outerInverse,
        rect: fixedWindow,
        radius: clip.windowCornerRadius ?? 0,
      }),
      headerAlpha: headerAlpha(headerImage, headerImage.naturalWidth, headerImage.naturalHeight),
      headerWidth: headerImage.naturalWidth,
      headerHeight: headerImage.naturalHeight,
    };
  } finally {
    uploads.restore();
    const context = context2d(source);
    context.fillStyle = '#dbdcdd';
    context.fillRect(0, 0, source.width, source.height);
    owner.dispose();
  }
}

async function samplerControls(): Promise<GpuWindowJoinReport['sampler']> {
  const owner = await createGpuPreviewRenderer();
  if (!owner) throw new Error('E_JOIN_SAMPLER_GPU');
  const source = canvas({ width: 8, height: 8 });
  const context = context2d(source);
  context.fillStyle = 'rgba(100,150,200,0.5)';
  context.fillRect(0, 0, 8, 8);
  const rows: GpuWindowJoinReport['sampler'] = [];
  const size = { width: 64, height: 56 };
  const read = (data: Uint8ClampedArray, x: number, y: number, channel: number) =>
    data[(y * size.width + x) * 4 + channel]!;
  try {
    for (const filtered of [false, true]) {
      const base: GpuPreviewLayer = {
        source,
        rect: { x: 8.37, y: 8.43, width: 40.6, height: 30.8 },
        inverse: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        clampSourceEdges: ['bottom'],
        ...(filtered ? { blur: 0.001 } : {}),
      };
      const render = async (layer: GpuPreviewLayer) => {
        const bitmap = await owner.render({
          output: size,
          logical: size,
          layers: [layer],
          signal: new AbortController().signal,
        });
        const target = canvas(size);
        try {
          context2d(target).drawImage(bitmap, 0, 0);
          return pixels(target);
        } finally {
          bitmap.close();
          target.width = target.height = 0;
        }
      };
      const plain = await render(base),
        clipped = await render({
          ...base,
          clip: { rect: { x: 20.2, y: 0, width: 40, height: 56 }, radius: 0, shape: 'hard-rect' },
        });
      let edgeDifference = 0;
      for (let channel = 0; channel < 4; channel++)
        edgeDifference = Math.max(
          edgeDifference,
          Math.abs(read(plain, 32, 38, channel) - read(plain, 32, 20, channel))
        );
      rows.push({
        filtered,
        edgeDifference,
        interiorAlpha: read(plain, 32, 20, 3),
        edgeAlpha: read(plain, 32, 38, 3),
        exteriorAlpha: read(plain, 32, 41, 3),
        clippedAlpha: read(clipped, 10, 20, 3),
        hardClipAlpha: read(clipped, 20, 20, 3),
      });
    }
    return rows;
  } finally {
    source.width = source.height = 0;
    owner.dispose();
  }
}

/** Fixed synthetic GPU seam proof. It accepts no page, project or remote input. */
export function installGpuWindowJoinFixture() {
  window.gpuWindowJoinFixture = {
    async run() {
      const source = canvas(sourceSize);
      const context = context2d(source);
      context.fillStyle = '#dbdcdd';
      context.fillRect(0, 0, source.width, source.height);
      try {
        const rows = [await galleryJoin(source)];
        for (const variant of [
          'direct',
          'orientation',
          'depth',
          'crop-orientation',
          'crop-inner',
        ] as const)
          rows.push(await nativeJoin(source, variant));
        return { rows, sampler: await samplerControls() };
      } finally {
        source.width = source.height = 0;
      }
    },
  };
}
