import type { ScenarioSlide } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioAiOperation } from '@sniptale/runtime-contracts/scenario-ai-operations';
import { touchSlide } from './slide';

export function applyScenarioAiCanvasPatch(
  slide: ScenarioSlide,
  patch: Extract<ScenarioAiOperation, { type: 'setSlideCanvas' }>['canvasPatch']
): ScenarioSlide {
  return touchSlide({
    ...slide,
    canvas: {
      ...slide.canvas,
      background: patch.background ?? slide.canvas.background,
      height: patch.height ?? slide.canvas.height,
      width: patch.width ?? slide.canvas.width,
    },
  });
}
