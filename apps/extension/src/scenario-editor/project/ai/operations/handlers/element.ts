import {
  createScenarioArrowElement,
  createScenarioCalloutElement,
  createScenarioCodeElement,
  createScenarioImageElement,
  createScenarioLineElement,
  createScenarioShapeElement,
  createScenarioTextElement,
} from '../../../../../features/scenario/project/v3';
import { SCENARIO_V3_ELEMENT_KINDS } from '@sniptale/runtime-contracts/scenario/types/v3';
import type {
  ScenarioArrowElement,
  ScenarioCalloutElement,
  ScenarioCodeElement,
  ScenarioElement,
  ScenarioImageElement,
  ScenarioLineElement,
  ScenarioShapeElement,
  ScenarioTextElement,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import type {
  ScenarioAiElementInput,
  ScenarioAiElementPatch,
} from '@sniptale/runtime-contracts/scenario-ai-operations';

export function createScenarioAiElement(input: ScenarioAiElementInput): ScenarioElement {
  if (input.kind === SCENARIO_V3_ELEMENT_KINDS.text) {
    return createScenarioTextElement(toFactoryOverrides<ScenarioTextElement>(input));
  }
  if (input.kind === SCENARIO_V3_ELEMENT_KINDS.image) {
    return createScenarioImageElement(toFactoryOverrides<ScenarioImageElement>(input));
  }
  if (input.kind === SCENARIO_V3_ELEMENT_KINDS.shape) {
    return createScenarioShapeElement(toFactoryOverrides<ScenarioShapeElement>(input));
  }
  if (input.kind === SCENARIO_V3_ELEMENT_KINDS.line) {
    return createScenarioLineElement(toFactoryOverrides<ScenarioLineElement>(input));
  }
  if (input.kind === SCENARIO_V3_ELEMENT_KINDS.arrow) {
    return createScenarioArrowElement(toFactoryOverrides<ScenarioArrowElement>(input));
  }
  if (input.kind === SCENARIO_V3_ELEMENT_KINDS.callout) {
    return createScenarioCalloutElement(toFactoryOverrides<ScenarioCalloutElement>(input));
  }

  return createScenarioCodeElement(toFactoryOverrides<ScenarioCodeElement>(input));
}

export function applyScenarioAiElementPatch(
  element: ScenarioElement,
  patch: ScenarioAiElementPatch
): ScenarioElement {
  const { animation, build, contentTransform, frame, panel, style, ...flatPatch } = patch;
  const nextElement = {
    ...element,
    animation: animation ? mergeDefinedPatch(element.animation, animation) : element.animation,
    build: build ? mergeDefinedPatch(element.build, build) : element.build,
    ...flatPatch,
    frame: frame ? { ...element.frame, ...frame } : element.frame,
    updatedAt: Date.now(),
  } as ScenarioElement;

  if (contentTransform && 'contentTransform' in nextElement) {
    nextElement.contentTransform = mergeDefinedPatch(
      nextElement.contentTransform,
      contentTransform
    );
  }
  if (panel && 'panel' in nextElement) {
    nextElement.panel = mergeDefinedPatch(nextElement.panel, panel);
  }
  if (style && 'style' in nextElement) {
    nextElement.style = mergeDefinedPatch(nextElement.style, style);
  }

  return nextElement;
}

export function reorderScenarioAiElement(
  elements: ScenarioElement[],
  elementId: string,
  position: number
): ScenarioElement[] {
  const fromIndex = elements.findIndex((element) => element.id === elementId);
  if (fromIndex < 0 || position >= elements.length) {
    return elements;
  }

  const nextElements = elements.slice();
  const [element] = nextElements.splice(fromIndex, 1);
  if (!element) {
    return elements;
  }

  nextElements.splice(position, 0, element);
  return nextElements;
}

function toFactoryOverrides<TElement extends ScenarioElement>(
  input: ScenarioAiElementInput
): Partial<TElement> {
  return stripUndefinedFields(input) as Partial<TElement>;
}

function mergeDefinedPatch<TBase extends object>(base: TBase, patch: object): TBase {
  return {
    ...base,
    ...(stripUndefinedFields(patch) as Partial<TBase>),
  };
}

function stripUndefinedFields(value: object): object {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, isPlainObject(entry) ? stripUndefinedFields(entry) : entry])
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
