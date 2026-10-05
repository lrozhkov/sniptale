import { createReviewSpotlightMasks } from '../../../../apps/extension/src/workflows/video-review/render-spotlight';
import { drawReviewBorders } from '../../../../apps/extension/src/workflows/video-review/render-border';
import {
  createQuickEditBorder,
  evaluateQuickEditBordersAtTime,
} from '../../../../apps/extension/src/features/video/review/advanced/border';
import { createQuickEditZoomRegion } from '../../../../apps/extension/src/features/video/review/advanced/zoom';

export function probe() {
  const output = { width: 100, height: 100 };
  const first = {
    opening: { x: 10, y: 10, width: 40, height: 40 },
    radius: 0,
    dim: 0.8,
    blur: 0,
    presence: 1,
  };
  const second = {
    opening: { x: 30, y: 30, width: 40, height: 40 },
    radius: 0,
    dim: 0.6,
    blur: 0,
    presence: 1,
  };
  const masks = createReviewSpotlightMasks(output, [first, second]);
  const alpha = (x: number, y: number) =>
    masks.dim.getContext('2d')!.getImageData(x, y, 1, 1).data[3];
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 100;
  const context = canvas.getContext('2d')!;
  const border = {
    ...createQuickEditZoomRegion({ id: 'b', at: 0, duration: 4 }),
    border: {
      ...createQuickEditBorder(),
      roundness: 0,
      area: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      reveal: 'draw' as const,
    },
    enter: { type: 'linear' as const, duration: 1 },
  };
  const frames = evaluateQuickEditBordersAtTime({
    regions: [border],
    time: 0.25,
    output,
    video: { x: 0, y: 0, width: 100, height: 100 },
    scale: 1,
  });
  drawReviewBorders(context, output, frames);
  const stroke = (x: number, y: number) => context.getImageData(x, y, 1, 1).data[3];
  const edges = { top: stroke(75, 11), bottom: stroke(50, 88), right: stroke(88, 70) };
  const patterned = (['solid', 'dashed', 'dotted'] as const).map((style) => {
    const counts = [0.25, 1.5].map((time) => {
      context.clearRect(0, 0, 100, 100);
      drawReviewBorders(
        context,
        output,
        evaluateQuickEditBordersAtTime({
          regions: [{ ...border, border: { ...border.border, style } }],
          time,
          output,
          video: { x: 0, y: 0, width: 100, height: 100 },
          scale: 1,
        })
      );
      const data = context.getImageData(0, 0, 100, 100).data;
      let count = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) count++;
      return count;
    });
    return { style, partial: counts[0], full: counts[1] };
  });
  return {
    start: probeBorderStart(),
    motion: probeBorderMotion(),
    patterned,
    outside: alpha(90, 90),
    firstOnly: alpha(15, 15),
    overlap: alpha(40, 40),
    secondOnly: alpha(60, 60),
    ...edges,
  };
}

/** Sample actual Chromium raster output: opposite directions and moving full patterns. */
function probeBorderMotion() {
  const output = { width: 100, height: 100 };
  const canvas = document.createElement('canvas');
  canvas.width = output.width;
  canvas.height = output.height;
  const context = canvas.getContext('2d')!;
  const region = {
    ...createQuickEditZoomRegion({ id: 'motion', at: 0, duration: 4 }),
    border: {
      ...createQuickEditBorder(),
      roundness: 0,
      area: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    },
    enter: { type: 'linear' as const, duration: 1 },
    exit: { type: 'linear' as const, duration: 1 },
  };
  const render = (border: typeof region.border, time: number) => {
    context.clearRect(0, 0, 100, 100);
    drawReviewBorders(
      context,
      output,
      evaluateQuickEditBordersAtTime({
        regions: [{ ...region, border }],
        time,
        output,
        video: { x: 0, y: 0, width: 100, height: 100 },
        scale: 1,
      })
    );
    return context.getImageData(0, 0, 100, 100).data;
  };
  const edges = (data: Uint8ClampedArray) => ({
    topRight: data[(11 * 100 + 75) * 4 + 3],
    topLeft: data[(11 * 100 + 25) * 4 + 3],
  });
  const draw = (['draw', 'draw-ccw'] as const).map((reveal) => ({
    direction: reveal,
    ...edges(render({ ...region.border, reveal }, 0.25)),
  }));
  const erase = (['erase', 'erase-ccw'] as const).map((exitReveal) => ({
    direction: exitReveal,
    ...edges(render({ ...region.border, exitReveal }, 3.25)),
  }));
  const moving = (['solid', 'dashed', 'dotted'] as const).map((style) => {
    const border = { ...region.border, style, loop: true, segmentPercent: 100 };
    const first = render(border, 1.25);
    const second = render(border, 1.75);
    let changed = 0,
      painted = 0;
    for (let i = 3; i < first.length; i += 4) {
      if (first[i] !== second[i]) changed++;
      if (second[i]! > 0) painted++;
    }
    return { style, changed, painted };
  });
  const pulse = (['solid', 'dashed', 'dotted'] as const).map((style) => {
    const border = { ...region.border, style, loop: true, motion: 'pulse' as const };
    const full = render(border, 1);
    const low = render(border, 2);
    let fullAlpha = 0,
      lowAlpha = 0;
    for (let i = 3; i < full.length; i += 4) {
      fullAlpha += full[i]!;
      lowAlpha += low[i]!;
    }
    return { style, fullAlpha, lowAlpha };
  });
  const clockwise = render(
    { ...region.border, style: 'dashed', loop: true, motion: 'clockwise' },
    1.2
  );
  const counterclockwise = render(
    { ...region.border, style: 'dashed', loop: true, motion: 'counterclockwise' },
    1.2
  );
  let oppositePixels = 0;
  for (let i = 3; i < clockwise.length; i += 4)
    if (clockwise[i] !== counterclockwise[i]) oppositePixels++;
  return { draw, erase, moving, pulse, oppositePixels };
}

/** Early frames reveal the origin/cap shape, not just completed perimeter coverage. */
function probeBorderStart() {
  const output = { width: 240, height: 100 };
  const sheet = document.createElement('canvas');
  sheet.width = 720;
  sheet.height = 240;
  sheet.setAttribute('aria-label', 'Border entrance: clockwise above, counterclockwise below');
  document.body.append(sheet);
  const preview = sheet.getContext('2d')!;
  preview.fillStyle = '#ffffff';
  preview.fillRect(0, 0, sheet.width, sheet.height);
  const canvas = document.createElement('canvas');
  canvas.width = output.width;
  canvas.height = output.height;
  const context = canvas.getContext('2d')!;
  return (['draw', 'draw-ccw'] as const).map((reveal, row) => {
    const samples = [0, 0.025, 0.08, 0.35, 1].map((time) => {
      context.clearRect(0, 0, output.width, output.height);
      const region = {
        ...createQuickEditZoomRegion({ id: 'early', at: 0, duration: 4 }),
        border: {
          ...createQuickEditBorder(),
          width: 8,
          roundness: 0.15,
          reveal,
          area: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        },
        enter: { type: 'linear' as const, duration: 1 },
      };
      drawReviewBorders(
        context,
        output,
        evaluateQuickEditBordersAtTime({
          regions: [region],
          time,
          output,
          video: { x: 0, y: 0, ...output },
          scale: 1,
        })
      );
      if (time > 0 && time < 1) {
        const column = time === 0.025 ? 0 : time === 0.08 ? 1 : 2;
        preview.drawImage(canvas, column * 240, row * 120 + 20);
        preview.fillStyle = '#333333';
        preview.fillText(`${reveal} · ${time}s`, column * 240 + 24, row * 120 + 16);
      }
      const alpha = (x: number, y: number) => context.getImageData(x, y, 1, 1).data[3];
      const pixels = context.getImageData(0, 0, output.width, output.height).data;
      let painted = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]! > 0) painted++;
      return {
        time,
        painted,
        center: alpha(120, 14),
        cap: alpha(reveal === 'draw' ? 117 : 122, 14),
        capOutside: alpha(reveal === 'draw' ? 116 : 123, 10),
        right: alpha(130, 14),
        left: alpha(110, 14),
        corner: alpha(28, 20),
      };
    });
    return { reveal, samples };
  });
}
