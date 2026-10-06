import { DEFAULT_WINDOW_HEADER } from '../../../../apps/extension/src/features/browser-frame/header';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ReviewSpotlightOverlay } from '../../../../apps/extension/src/gallery/video-review/spotlight-overlay';
import { createReviewSpotlightMasks } from '../../../../apps/extension/src/workflows/video-review/render-spotlight';
import { drawReviewSceneFrame } from '../../../../apps/extension/src/workflows/video-review/scene-frame';
import {
  computeQuickEditSceneLayout,
  computeQuickEditSceneSize,
} from '../../../../apps/extension/src/features/video/review/advanced/scene';
import { drawReviewSpotlights } from '../../../../apps/extension/src/workflows/video-review/render-spotlight';

function edgeProbe() {
  return [false, true].map((clipped) => {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 160;
    const context = canvas.getContext('2d')!;
    for (let x = 0; x < canvas.width; x++) {
      context.fillStyle = x % 2 ? '#ffffff' : '#000000';
      context.fillRect(x, 0, 1, canvas.height);
    }
    const scratch = document.createElement('canvas');
    scratch.width = canvas.width;
    scratch.height = canvas.height;
    drawReviewSpotlights(
      context,
      canvas,
      scratch,
      [{ opening: { x: 10, y: 65, width: 20, height: 20 }, radius: 2, blur: 12, dim: 0 }],
      clipped ? { rect: { x: 15, y: 15, width: 200, height: 130 }, radius: 10 } : undefined
    );
    const contrast = (y: number) => {
      const pixels = context.getImageData(80, y, 80, 1).data;
      let contrast = 0;
      for (let i = 4; i < pixels.length; i += 4)
        contrast = Math.max(contrast, Math.abs(pixels[i]! - pixels[i - 4]!));
      return contrast;
    };
    document.body.append(canvas);
    return { clipped, top: contrast(0), bottom: contrast(159), middle: contrast(80) };
  });
}

function sceneProbe() {
  const source = { width: 200, height: 100 };
  const background = {
    enabled: true as const,
    type: 'solid' as const,
    color: '#777777',
    layout: { padding: 8, cornerRadius: 14, shadow: { intensity: 80, color: '#000000ff' } },
  };
  const windowHeader = { ...DEFAULT_WINDOW_HEADER, kind: 'browser' as const, title: 'Browser' };
  const output = computeQuickEditSceneSize({ source, background, windowHeader });
  const canvas = Object.assign(document.createElement('canvas'), output);
  const context = canvas.getContext('2d')!;
  const layout = computeQuickEditSceneLayout({
    output,
    source,
    background,
    windowHeader,
    camera: { scale: 1, centerX: 0.5, centerY: 0.5 },
  });
  const header = Object.assign(document.createElement('canvas'), { width: 200, height: 20 });
  const headerContext = header.getContext('2d')!;
  headerContext.fillStyle = '#ffffff';
  headerContext.fillRect(0, 0, 200, 20);
  headerContext.fillStyle = '#000000';
  for (let x = 0; x < 200; x += 4) headerContext.fillRect(x, 6, 2, 8);
  drawReviewSceneFrame(context, {
    canvas,
    layout,
    background,
    image: null,
    headerImage: header,
    sample: {
      draw: (target, x, y, width, height) => {
        target.fillStyle = '#eeeeee';
        target.fillRect(x, y, width, height);
        target.fillStyle = '#222222';
        for (let dx = 0; dx < width; dx += 4) target.fillRect(x + dx, y, 2, height);
      },
    },
  });
  const original = context.getImageData(0, 0, canvas.width, canvas.height);
  // Independent reference: explicitly clamp each raster sample at the scene boundary.
  const pad = 40;
  const referenceSource = Object.assign(document.createElement('canvas'), {
    width: canvas.width + pad * 2,
    height: canvas.height + pad * 2,
  });
  const referenceContext = referenceSource.getContext('2d')!;
  const raster = referenceContext.createImageData(referenceSource.width, referenceSource.height);
  for (let y = 0; y < referenceSource.height; y++)
    for (let x = 0; x < referenceSource.width; x++) {
      const offset =
        (Math.max(0, Math.min(canvas.height - 1, y - pad)) * canvas.width +
          Math.max(0, Math.min(canvas.width - 1, x - pad))) *
        4;
      raster.data.set(
        original.data.subarray(offset, offset + 4),
        (y * referenceSource.width + x) * 4
      );
    }
  referenceContext.putImageData(raster, 0, 0);
  const reference = Object.assign(document.createElement('canvas'), output);
  const target = reference.getContext('2d')!;
  target.filter = 'blur(12px)';
  target.drawImage(referenceSource, -pad, -pad);
  const blurred = target.getImageData(0, 0, canvas.width, canvas.height).data;
  const errors = [];
  for (const dim of [0, 0.65])
    for (const overlapping of [false, true]) {
      context.putImageData(original, 0, 0);
      const frame = {
        opening: { x: 2, y: 50, width: 20, height: 20 },
        radius: 2,
        dim,
        blur: dim ? 0 : 12,
      };
      drawReviewSpotlights(
        context,
        canvas,
        document.createElement('canvas'),
        overlapping ? [frame, { ...frame, opening: { ...frame.opening, x: 25 } }] : [frame],
        { rect: layout.windowRect, radius: 14 }
      );
      const actual = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let error = 0;
      let worst = {};
      for (let y = 0; y < canvas.height; y++)
        for (let x = 70; x < canvas.width; x++) {
          const offset = (y * canvas.width + x) * 4;
          for (let c = 0; c < 3; c++) {
            const delta = Math.abs(
              actual[offset + c]! -
                (dim ? original.data[offset + c]! * (1 - dim) : blurred[offset + c]!)
            );
            if (delta > error) {
              error = delta;
              worst = {
                x,
                y,
                actual: actual[offset + c],
                original: original.data[offset + c],
                reference: blurred[offset + c],
                alpha: actual[offset + 3],
              };
            }
          }
        }
      errors.push({ dim, overlapping, error, worst });
      const view = Object.assign(document.createElement('canvas'), output);
      view.getContext('2d')!.drawImage(canvas, 0, 0);
      document.body.append(view);
    }
  return errors;
}

async function previewProbe() {
  const output = { width: 240, height: 160 };
  const clip = { rect: { x: 20, y: 20, width: 200, height: 120 }, radius: 20 };
  const host = document.createElement('div');
  host.style.width = '240px';
  document.body.append(host);
  const root = createRoot(host);
  const samples = [];
  try {
    for (const distance of [0, 25]) {
      const frame = {
        opening: {
          x: 10 - distance,
          y: 20 - distance,
          width: 60 + 2 * distance,
          height: 50 + 2 * distance,
        },
        radius: 4 + distance,
        protectionOpening: { x: 10, y: 20, width: 60, height: 50 },
        protectionRadius: 4,
        presence: distance ? 0.5 : 1,
        openingClipProgress: distance ? 0.5 : 1,
        dim: 1,
        blur: 0,
      };
      flushSync(() =>
        root.render(createElement(ReviewSpotlightOverlay, { output, frames: [frame], clip }))
      );
      const node = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.spotlight"]')!;
      const url = node.style.maskImage.slice(5, -2);
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = Object.assign(document.createElement('canvas'), output);
      canvas.getContext('2d')!.drawImage(image, 0, 0, output.width, output.height);
      const actual = canvas.getContext('2d')!.getImageData(0, 0, output.width, output.height).data;
      const expected = createReviewSpotlightMasks(output, [frame], clip)
        .dim.getContext('2d')!
        .getImageData(0, 0, output.width, output.height).data;
      let mismatch = 0;
      for (let i = 3; i < actual.length; i += 4)
        if (Math.abs(actual[i]! - expected[i]!) > 8) mismatch++;
      samples.push(mismatch);
    }
  } finally {
    flushSync(() => root.unmount());
    host.remove();
  }
  return samples;
}

function liveMaskProbe() {
  const host = document.createElement('div');
  host.style.width = '1280px';
  document.body.append(host);
  const root = createRoot(host);
  const encode = HTMLCanvasElement.prototype.toDataURL;
  let encodes = 0;
  HTMLCanvasElement.prototype.toDataURL = function (...args) {
    encodes++;
    return encode.apply(this, args);
  };
  const frame = { opening: { x: 10, y: 300, width: 20, height: 20 }, radius: 2, dim: 0, blur: 20 };
  const show = () =>
    flushSync(() =>
      root.render(
        createElement(ReviewSpotlightOverlay, {
          output: { width: 1280, height: 720 },
          frames: [{ ...frame }, { ...frame, opening: { ...frame.opening, x: 60 } }],
        })
      )
    );
  try {
    const start = performance.now();
    show();
    const firstMs = performance.now() - start;
    const updates = performance.now();
    for (let i = 0; i < 30; i++) show();
    return { encodes, firstMs, thirtyUpdatesMs: performance.now() - updates };
  } finally {
    HTMLCanvasElement.prototype.toDataURL = encode;
    flushSync(() => root.unmount());
    host.remove();
  }
}

export async function probe() {
  return {
    edges: edgeProbe(),
    scene: sceneProbe(),
    preview: await previewProbe(),
    live: liveMaskProbe(),
  };
}
