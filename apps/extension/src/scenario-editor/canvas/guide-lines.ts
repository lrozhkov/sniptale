import type { ScenarioElementFrame } from '@sniptale/runtime-contracts/scenario/types/v3';

export type ScenarioCanvasGuideAxis = 'horizontal' | 'vertical';

export interface ScenarioCanvasGuideLine {
  axis: ScenarioCanvasGuideAxis;
  position: number;
}

export function createScenarioCanvasFrameGuideLines(
  frame: ScenarioElementFrame
): ScenarioCanvasGuideLine[] {
  return [
    { axis: 'vertical', position: frame.x },
    { axis: 'vertical', position: frame.x + frame.width / 2 },
    { axis: 'vertical', position: frame.x + frame.width },
    { axis: 'horizontal', position: frame.y },
    { axis: 'horizontal', position: frame.y + frame.height / 2 },
    { axis: 'horizontal', position: frame.y + frame.height },
  ];
}
