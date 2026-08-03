import {
  createScenarioArrowElement,
  createScenarioCalloutElement,
  createScenarioCodeElement,
  createScenarioImageElement,
  createScenarioLineElement,
  createScenarioShapeElement,
  createScenarioTextElement,
} from '../../features/scenario/project/v3';
import { SCENARIO_V3_ELEMENT_KINDS } from '@sniptale/runtime-contracts/scenario/types/v3';
import type {
  ScenarioElement,
  ScenarioV3ElementKind,
} from '@sniptale/runtime-contracts/scenario/types/v3';

const ELEMENT_CREATORS = {
  [SCENARIO_V3_ELEMENT_KINDS.arrow]: createScenarioArrowElement,
  [SCENARIO_V3_ELEMENT_KINDS.callout]: createScenarioCalloutElement,
  [SCENARIO_V3_ELEMENT_KINDS.code]: createScenarioCodeElement,
  [SCENARIO_V3_ELEMENT_KINDS.image]: createScenarioImageElement,
  [SCENARIO_V3_ELEMENT_KINDS.line]: createScenarioLineElement,
  [SCENARIO_V3_ELEMENT_KINDS.shape]: createScenarioShapeElement,
  [SCENARIO_V3_ELEMENT_KINDS.text]: createScenarioTextElement,
} satisfies Record<ScenarioV3ElementKind, () => ScenarioElement>;

export function createInsertedElement(kind: ScenarioV3ElementKind): ScenarioElement {
  return ELEMENT_CREATORS[kind]();
}
