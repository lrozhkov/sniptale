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
  const edges = { top: stroke(50, 11), bottom: stroke(50, 88), right: stroke(88, 50) };
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
    patterned,
    outside: alpha(90, 90),
    firstOnly: alpha(15, 15),
    overlap: alpha(40, 40),
    secondOnly: alpha(60, 60),
    ...edges,
  };
}
