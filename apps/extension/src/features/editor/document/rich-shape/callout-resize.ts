import {
  createDefaultRichShapeCalloutGeometry,
  normalizeRichShapeCalloutGeometry,
} from './callout';
import type { EditorRichShapeCalloutGeometry, EditorRichShapeFrame } from './types';

export function resizeRichShapeCalloutGeometry(
  callout: EditorRichShapeCalloutGeometry,
  previousFrame: EditorRichShapeFrame,
  nextFrame: EditorRichShapeFrame
): EditorRichShapeCalloutGeometry {
  if (
    previousFrame.width <= 1 ||
    previousFrame.height <= 1 ||
    nextFrame.width <= 1 ||
    nextFrame.height <= 1
  ) {
    return createDefaultRichShapeCalloutGeometry(nextFrame, callout.tail.side);
  }

  const xRatio = nextFrame.width / previousFrame.width;
  const yRatio = nextFrame.height / previousFrame.height;
  return (
    normalizeRichShapeCalloutGeometry(
      {
        body: {
          left: callout.body.left * xRatio,
          top: callout.body.top * yRatio,
          width: callout.body.width * xRatio,
          height: callout.body.height * yRatio,
        },
        tail: {
          ...callout.tail,
          tip: {
            x: callout.tail.tip.x * xRatio,
            y: callout.tail.tip.y * yRatio,
          },
        },
      },
      nextFrame
    ) ?? createDefaultRichShapeCalloutGeometry(nextFrame, callout.tail.side)
  );
}
