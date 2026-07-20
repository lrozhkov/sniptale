import type { useScenarioCanvasStageModel } from './model';

type ScenarioCanvasStageModel = ReturnType<typeof useScenarioCanvasStageModel>;

export type ScenarioCanvasGuides = ScenarioCanvasStageModel['guides'];
export type ScenarioCanvasInteractions = ScenarioCanvasStageModel['interactions'];
export type ScenarioCanvasRenderedSlide = ScenarioCanvasStageModel['rendered'];
