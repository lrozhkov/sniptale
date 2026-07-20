import type { ScenarioElementFrame } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioRenderedElement } from '../project/stage-render/slide';
import { createScenarioCanvasFrameGuideLines } from './guide-lines';

export interface ScenarioCanvasGuide {
  axis: 'horizontal' | 'vertical';
  position: number;
}

const GUIDE_TOLERANCE = 4;

export function resolveScenarioCanvasGuides(args: {
  activeElementId: string | null;
  frame: ScenarioElementFrame | null;
  renderedElements: readonly ScenarioRenderedElement[];
  slide: { height: number; width: number };
}): ScenarioCanvasGuide[] {
  if (!args.frame) {
    return [];
  }

  const activeLines = createScenarioCanvasFrameGuideLines(args.frame);
  const referenceLines = [
    ...createScenarioCanvasFrameGuideLines({
      height: args.slide.height,
      width: args.slide.width,
      x: 0,
      y: 0,
    }),
    ...args.renderedElements
      .filter((rendered) => rendered.element.id !== args.activeElementId)
      .flatMap((rendered) => createScenarioCanvasFrameGuideLines(rendered.box)),
  ];

  return uniqueGuides(
    activeLines.flatMap((activeLine) =>
      referenceLines
        .filter((referenceLine) => referenceLine.axis === activeLine.axis)
        .filter((referenceLine) => isGuideMatch(activeLine.position, referenceLine.position))
        .map((referenceLine) => ({
          axis: activeLine.axis,
          position: referenceLine.position,
        }))
    )
  );
}

function isGuideMatch(first: number, second: number): boolean {
  return Math.abs(first - second) <= GUIDE_TOLERANCE;
}

function uniqueGuides(guides: ScenarioCanvasGuide[]): ScenarioCanvasGuide[] {
  const keys = new Set<string>();
  return guides.filter((guide) => {
    const key = `${guide.axis}:${guide.position}`;
    if (keys.has(key)) {
      return false;
    }
    keys.add(key);
    return true;
  });
}
