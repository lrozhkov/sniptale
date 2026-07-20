import type { ScenarioSlide } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioAiElementPatch } from '@sniptale/runtime-contracts/scenario-ai-operations';
import {
  applyScenarioAiElementPatch,
  createScenarioAiElement,
  reorderScenarioAiElement,
} from './element';
import type { ScenarioAiElementInput } from '@sniptale/runtime-contracts/scenario-ai-operations';

export function addScenarioAiElementToSlide(args: {
  element: ScenarioAiElementInput;
  position?: number;
  slide: ScenarioSlide;
}): ScenarioSlide {
  const element = createScenarioAiElement(args.element);
  const position = args.position ?? args.slide.elements.length;
  const elements = args.slide.elements.slice();

  elements.splice(Math.min(position, elements.length), 0, element);
  return touchSlide({ ...args.slide, elements });
}

export function deleteScenarioAiElementFromSlide(args: {
  elementId: string;
  slide: ScenarioSlide;
}): ScenarioSlide {
  return touchSlide({
    ...args.slide,
    elements: args.slide.elements.filter((element) => element.id !== args.elementId),
  });
}

export function reorderScenarioAiElementInSlide(args: {
  elementId: string;
  position: number;
  slide: ScenarioSlide;
}): ScenarioSlide {
  return touchSlide({
    ...args.slide,
    elements: reorderScenarioAiElement(args.slide.elements, args.elementId, args.position),
  });
}

export function updateScenarioAiElementInSlide(args: {
  elementId: string;
  patch: ScenarioAiElementPatch;
  slide: ScenarioSlide;
}): ScenarioSlide {
  return touchSlide({
    ...args.slide,
    elements: args.slide.elements.map((element) =>
      element.id === args.elementId ? applyScenarioAiElementPatch(element, args.patch) : element
    ),
  });
}

export function touchSlide(slide: ScenarioSlide): ScenarioSlide {
  return {
    ...slide,
    updatedAt: Date.now(),
  };
}
