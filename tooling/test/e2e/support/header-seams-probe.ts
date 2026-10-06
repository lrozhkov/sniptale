import {
  reviewWindowHeaderUrl,
  loadReviewWindowHeader,
} from '../../../../apps/extension/src/workflows/video-review/window-header';
import { drawReviewSceneFrame } from '../../../../apps/extension/src/workflows/video-review/scene-frame';
import {
  computeQuickEditSceneLayout,
  computeQuickEditVideoTransform,
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
  color: string;
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
    color,
    zoomBehavior,
    layout: { padding: 40, cornerRadius: 18 },
  } as const;
  const layout = computeQuickEditSceneLayout({
    output,
    source: video,
    background,
    windowHeader: { kind: 'browser', title: '' },
    camera,
  });
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
  let example = null;
  for (let frame = 0; frame < 90; frame++) {
    const scale = 1.15 + frame / 300;
    const args = { image, video, context, zoomBehavior, blurred, scale };
    // Interior window pixels must be independent of the background, including antialiasing.
    const dark = paintJoin({ ...args, color: '#000000' }),
      light = paintJoin({ ...args, color: '#ffffff' });
    for (let index = 0; index < dark.length; index++)
      if (Math.abs(dark[index]! - light[index]!) > leak) {
        leak = Math.abs(dark[index]! - light[index]!);
        example = { frame, scale, difference: leak };
      }
  }
  return { zoomBehavior, blurred, leak, example };
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
      reviewWindowHeaderUrl({ kind: 'browser', title: 'Header', url: '' }, width),
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
