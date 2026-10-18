import { FabricImage, filters } from 'fabric';
import {
  attachImageStyleRenderer,
  attachBrowserHeaderToImage,
} from '../../../../apps/extension/src/editor/objects/image-frame';
import { renderExactBrowserFrameToDataUrl } from '../../../../apps/extension/src/editor/browser-frame/factory/exact/renderer';
import { windowHeaderGeometry } from '@sniptale/runtime-contracts/window-header';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_IMAGE_SETTINGS,
} from '../../../../apps/extension/src/features/editor/document/constants';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import {
  reviewWindowHeaderUrl,
  loadReviewWindowHeader,
  createReviewWindowRaster,
} from '../../../../apps/extension/src/workflows/video-review/window-header';
import { drawReviewSceneFrame } from '../../../../apps/extension/src/workflows/video-review/scene-frame';
import {
  computeQuickEditSceneLayout,
  computeQuickEditVideoTransform,
  computeQuickEditWindowTransform,
} from '../../../../apps/extension/src/features/video/review/advanced/scene';

function measureSlices(image: ImageBitmap, context: CanvasRenderingContext2D) {
  let minAlpha = 255;
  let example = null;
  for (let frame = 0; frame < 60; frame++) {
    const scale = ((0.8 + frame / 300) * 931) / image.width;
    const x = 13.37,
      y = 11.23;
    context.clearRect(0, 0, context.canvas.width, context.canvas.height);
    context.drawImage(image, x, y, image.width * scale, image.height * scale);
    for (const join of [527, image.width - 137]) {
      const pixels = context.getImageData(
        Math.floor(x + join * scale) - 2,
        Math.ceil(y + scale * 3),
        5,
        Math.max(1, Math.floor(scale * 4))
      ).data;
      for (let index = 3; index < pixels.length; index += 4)
        if (pixels[index]! < minAlpha) {
          minAlpha = pixels[index]!;
          example = { frame, scale, join, alpha: minAlpha };
        }
    }
  }
  return { minAlpha, example };
}

function paintJoin(args: {
  image: ImageBitmap;
  video: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  color: string | null;
  zoomBehavior: 'fixed' | 'follow-video';
  blurred: boolean;
  scale: number;
}) {
  const { image, video, context, color, zoomBehavior, blurred, scale } = args;
  const camera = { scale, centerX: 0.5, centerY: 0 };
  const output = { width: context.canvas.width, height: context.canvas.height };
  const background = {
    enabled: true,
    type: 'solid',
    color: color ?? '#000000',
    zoomBehavior,
    layout: { padding: 40, cornerRadius: 18 },
  } as const;
  const layout = computeQuickEditSceneLayout({
    output,
    source: video,
    background,
    windowHeader: { ...DEFAULT_WINDOW_HEADER, kind: 'browser' as const, title: '' },
    camera,
  });
  if (color === null) {
    const plane = createReviewWindowRaster({
      header: image,
      videoRect: layout.videoRect,
      windowRect: layout.windowRect,
      draw: (ctx, x, y, width, height) => ctx.drawImage(video, x, y, width, height),
    });
    try {
      context.clearRect(0, 0, output.width, output.height);
      const window = computeQuickEditWindowTransform(layout);
      context.drawImage(
        plane.image,
        0,
        0,
        plane.width,
        plane.height,
        window.x,
        window.y,
        window.width,
        window.height
      );
    } finally {
      plane.release();
    }
  } else
    drawReviewSceneFrame(context, {
      canvas: output,
      layout,
      background,
      image: null,
      headerImage: image,
      ...(blurred
        ? {
            motionBlur: [
              { camera: { ...camera, scale: camera.scale - 0.001 }, alpha: 0.5 },
              { camera: { ...camera, scale: camera.scale + 0.001 }, alpha: 0.5 },
            ],
          }
        : {}),
      sample: { draw: (ctx, x, y, width, height) => ctx.drawImage(video, x, y, width, height) },
    });
  return context.getImageData(400, Math.floor(layout.videoTransform.y) - 2, 20, 5).data;
}

function measureJoin(
  image: ImageBitmap,
  context: CanvasRenderingContext2D,
  zoomBehavior: 'fixed' | 'follow-video',
  blurred: boolean
) {
  const video = document.createElement('canvas');
  video.width = image.width;
  video.height = Math.round((image.width * 520) / 931);
  const videoContext = video.getContext('2d')!;
  videoContext.fillStyle = '#dbdcdd';
  videoContext.fillRect(0, 0, video.width, video.height);
  let leak = 0;
  let minAlpha = 255;
  let example = null;
  for (let frame = 0; frame < 90; frame++) {
    const scale = 1.15 + frame / 300;
    const args = { image, video, context, zoomBehavior, blurred, scale };
    // Interior window pixels must be independent of the background, including antialiasing.
    const dark = paintJoin({ ...args, color: '#000000' }),
      light = paintJoin({ ...args, color: '#ffffff' });
    const transparent = paintJoin({ ...args, color: null });
    for (let index = 3; index < transparent.length; index += 4)
      minAlpha = Math.min(minAlpha, transparent[index]!);
    for (let index = 0; index < dark.length; index++)
      if (Math.abs(dark[index]! - light[index]!) > leak) {
        leak = Math.abs(dark[index]! - light[index]!);
        example = { frame, scale, difference: leak };
      }
  }
  return { zoomBehavior, blurred, leak, minAlpha, example };
}

export async function probeHeaderSeams() {
  const surface = document.createElement('canvas');
  surface.width = 1100;
  surface.height = 720;
  document.body.append(surface);
  const context = surface.getContext('2d', { willReadFrequently: true })!;
  context.imageSmoothingQuality = 'high';
  const results = [];
  for (const width of [784, 931, 1920]) {
    const image = await loadReviewWindowHeader(
      reviewWindowHeaderUrl(
        { ...DEFAULT_WINDOW_HEADER, kind: 'browser' as const, title: 'Header', url: '' },
        width,
        520
      ),
      new AbortController().signal
    );
    try {
      const slices = measureSlices(image, context);
      const seams = [];
      for (const zoomBehavior of ['fixed', 'follow-video'] as const)
        for (const blurred of [false, true])
          seams.push(measureJoin(image, context, zoomBehavior, blurred));
      results.push({ width, slices, seams });
    } finally {
      image.close();
    }
  }
  return results;
}

/** Compare a boundary stroke with the same stroke embedded in a single source image. */
export function probeHeaderJoinFiltering() {
  const source = { width: 931, height: 520 };
  const header = document.createElement('canvas');
  header.width = source.width;
  header.height = 86;
  const head = header.getContext('2d')!;
  head.fillStyle = '#ffffff';
  head.fillRect(0, 0, header.width, header.height);
  head.fillStyle = '#606060';
  head.fillRect(0, 85, header.width, 1);
  const video = document.createElement('canvas');
  video.width = source.width;
  video.height = source.height;
  const body = video.getContext('2d')!;
  body.fillStyle = '#ffffff';
  body.fillRect(0, 0, video.width, video.height);
  const joined = document.createElement('canvas');
  joined.width = source.width;
  joined.height = 606;
  const joint = joined.getContext('2d')!;
  joint.drawImage(header, 0, 0);
  joint.drawImage(video, 0, 86);
  const actual = document.createElement('canvas'),
    expected = document.createElement('canvas');
  actual.width = expected.width = 1011;
  actual.height = expected.height = 686;
  document.body.append(actual, expected);
  const context = actual.getContext('2d', { willReadFrequently: true })!,
    reference = expected.getContext('2d', { willReadFrequently: true })!;
  context.imageSmoothingQuality = reference.imageSmoothingQuality = 'high';
  let maxDifference = 0;
  let worst = null;
  for (let frame = 0; frame < 90; frame++) {
    const scale = 1.15 + frame / 300;
    const background = {
      enabled: true,
      type: 'solid',
      color: '#000000',
      layout: { padding: 40, cornerRadius: 0 },
    } as const;
    const videoRect = { x: 40, y: 126, width: 931, height: 520 };
    const windowRect = { x: 40, y: 40, width: 931, height: 606 };
    const layout = {
      videoRect,
      windowRect,
      contentRect: windowRect,
      videoTransform: computeQuickEditVideoTransform({
        videoRect,
        windowRect,
        camera: { scale, centerX: 0.5, centerY: 0 },
      }),
    };
    drawReviewSceneFrame(context, {
      canvas: actual,
      layout,
      background,
      image: null,
      headerImage: header,
      sample: { draw: (ctx, x, y, width, height) => ctx.drawImage(video, x, y, width, height) },
    });
    reference.fillStyle = '#000000';
    reference.fillRect(0, 0, expected.width, expected.height);
    reference.drawImage(
      joined,
      layout.videoTransform.x,
      layout.videoTransform.y - 86 * scale,
      931 * scale,
      606 * scale
    );
    const y = Math.floor(layout.videoTransform.y) - 3;
    const a = context.getImageData(400, y, 20, 7).data,
      b = reference.getImageData(400, y, 20, 7).data;
    for (let index = 0; index < a.length; index++) {
      const difference = Math.abs(a[index]! - b[index]!);
      if (difference > maxDifference) {
        maxDifference = difference;
        worst = {
          frame,
          scale,
          difference,
          videoRect: layout.videoRect,
          windowRect: layout.windowRect,
          videoTransform: layout.videoTransform,
        };
      }
    }
  }
  return { maxDifference, worst };
}

/** Real Fabric source rendering must filter the joined image without exposing the backdrop. */
export async function probeImageHeaderJoin() {
  const canvas = document.createElement('canvas');
  canvas.width = 1400;
  canvas.height = 1000;
  document.body.append(canvas);
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  class ProbeImage extends FabricImage {
    renderPlane(context: CanvasRenderingContext2D) {
      this._render(context);
    }
  }
  const results = [];
  for (const size of [
    { width: 320, height: 181 },
    { width: 931, height: 601 },
    { width: 1280, height: 720 },
    { width: 1920, height: 1081 },
  ]) {
    const source = document.createElement('canvas');
    source.width = size.width;
    source.height = size.height;
    source.getContext('2d')!.fillRect(0, 0, source.width, source.height);
    const object = new ProbeImage(source);
    object.sniptaleType = 'source-image';
    attachImageStyleRenderer(object, () => ({
      ...DEFAULT_EDITOR_IMAGE_SETTINGS,
      radius: 0,
      strokeWidth: 0,
    }));
    for (const kind of ['browser', 'application'] as const)
      for (const style of ['windows', 'macos', 'linux'] as const)
        for (const theme of ['light', 'dark'] as const) {
          const settings = { ...DEFAULT_BROWSER_FRAME_STATE, kind, style, theme };
          const height = windowHeaderGeometry(settings, source).height;
          const header = new Image();
          header.src = await renderExactBrowserFrameToDataUrl({
            browserFrame: settings,
            width: source.width,
            sourceHeight: source.height,
            headerHeight: height,
            height,
            radius: 0,
          });
          await header.decode();
          attachBrowserHeaderToImage(object, header, height);
          let minAlpha = 255;
          let worst = null;
          for (const scale of [1, 2, 3, ...Array.from({ length: 80 }, (_, i) => 0.7 + i / 100)]) {
            context.resetTransform();
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.translate(700.37, 200.23 + (source.height * scale) / 2);
            context.scale(scale, scale);
            object.renderPlane(context);
            const pixels = context.getImageData(690, 198, 20, 5).data;
            for (let index = 3; index < pixels.length; index += 4)
              if (pixels[index]! < minAlpha) {
                minAlpha = pixels[index]!;
                worst = { scale, alpha: minAlpha };
              }
          }
          results.push({ source: size, kind, style, theme, headerHeight: height, minAlpha, worst });
        }
  }
  return results;
}

/** Transparent source rows and repeated filter previews retain their original content. */
export async function probeImageHeaderContent() {
  const source = document.createElement('canvas');
  source.width = 160;
  source.height = 90;
  const paint = source.getContext('2d')!;
  paint.fillStyle = '#646464';
  paint.fillRect(0, 2, 160, 88);
  paint.fillStyle = 'rgba(100,100,100,0.5)';
  paint.fillRect(0, 1, 160, 1);
  class ProbeImage extends FabricImage {
    renderPlane(context: CanvasRenderingContext2D) {
      this._render(context);
    }
  }
  const object = new ProbeImage(source);
  object.sniptaleType = 'source-image';
  attachImageStyleRenderer(object, () => ({
    ...DEFAULT_EDITOR_IMAGE_SETTINGS,
    radius: 0,
    strokeWidth: 0,
  }));
  const header = document.createElement('canvas');
  header.width = 160;
  header.height = 86;
  header.getContext('2d')!.fillRect(0, 0, 160, 86);
  attachBrowserHeaderToImage(object, header, 86);
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 176;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  const render = () => {
    context.resetTransform();
    context.clearRect(0, 0, 160, 176);
    context.translate(80, 131);
    object.renderPlane(context);
    return context.getImageData(80, 86, 1, 3).data;
  };
  const rows = render();
  const alpha = [rows[3], rows[7], rows[11]];
  attachBrowserHeaderToImage(object, header, 86.4);
  const fractionalRows = render();
  const fractionalAlpha = [fractionalRows[3], fractionalRows[7], fractionalRows[11]];
  object.filters = [new filters.Brightness({ brightness: 0.2 })];
  object.applyFilters();
  render();
  const first = context.getImageData(80, 100, 1, 1).data[0]!;
  const element = object.getElement();
  object.filters = [new filters.Brightness({ brightness: 0.4 })];
  object.applyFilters();
  render();
  const second = context.getImageData(80, 100, 1, 1).data[0]!;
  return {
    alpha,
    fractionalAlpha,
    first,
    second,
    reusedFilterElement: element === object.getElement(),
  };
}
