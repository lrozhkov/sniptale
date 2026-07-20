export type {
  ScenarioElementStylePatch,
  ScenarioV3ElementBase,
  ScenarioV3ElementKind,
} from './base';
export { SCENARIO_V3_ELEMENT_KINDS } from './base';
export type { ScenarioCalloutElement, ScenarioCalloutElementPatch } from './callout';
export type { ScenarioCodeElement, ScenarioCodeElementPatch } from './code';
export type { ScenarioImageElement, ScenarioImageElementPatch } from './image';
export type {
  ScenarioArrowElement,
  ScenarioArrowElementPatch,
  ScenarioLineElement,
  ScenarioLineElementPatch,
} from './line';
export type { ScenarioShapeElement, ScenarioShapeElementPatch } from './shape';
export type { ScenarioTextElement, ScenarioTextElementPatch } from './text';

import type { ScenarioCalloutElement, ScenarioCalloutElementPatch } from './callout';
import type { ScenarioCodeElement, ScenarioCodeElementPatch } from './code';
import type { ScenarioImageElement, ScenarioImageElementPatch } from './image';
import type {
  ScenarioArrowElement,
  ScenarioArrowElementPatch,
  ScenarioLineElement,
  ScenarioLineElementPatch,
} from './line';
import type { ScenarioShapeElement, ScenarioShapeElementPatch } from './shape';
import type { ScenarioTextElement, ScenarioTextElementPatch } from './text';

export type ScenarioElement =
  | ScenarioArrowElement
  | ScenarioCalloutElement
  | ScenarioCodeElement
  | ScenarioImageElement
  | ScenarioLineElement
  | ScenarioShapeElement
  | ScenarioTextElement;

export type ScenarioElementPatch =
  | ScenarioArrowElementPatch
  | ScenarioCalloutElementPatch
  | ScenarioCodeElementPatch
  | ScenarioImageElementPatch
  | ScenarioLineElementPatch
  | ScenarioShapeElementPatch
  | ScenarioTextElementPatch;
