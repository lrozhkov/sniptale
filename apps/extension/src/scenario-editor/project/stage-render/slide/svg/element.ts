import { SCENARIO_V3_ELEMENT_KINDS } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioRenderedElement } from '../types';
import { renderArrowElementSvg, renderLineElementSvg } from './connectors';
import { renderImageElementSvg } from './image';
import { renderCalloutElementSvg, renderShapeElementSvg } from './shapes';
import { renderCodeElementSvg, renderTextElementSvg } from './text';

function assertNever(value: never): never {
  throw new Error(`Unsupported scenario element kind: ${String(value)}`);
}

export function renderScenarioElementSvg(rendered: ScenarioRenderedElement): string {
  switch (rendered.kind) {
    case SCENARIO_V3_ELEMENT_KINDS.arrow:
      return renderArrowElementSvg(rendered);
    case SCENARIO_V3_ELEMENT_KINDS.callout:
      return renderCalloutElementSvg(rendered);
    case SCENARIO_V3_ELEMENT_KINDS.code:
      return renderCodeElementSvg(rendered);
    case SCENARIO_V3_ELEMENT_KINDS.image:
      return renderImageElementSvg(rendered);
    case SCENARIO_V3_ELEMENT_KINDS.line:
      return renderLineElementSvg(rendered);
    case SCENARIO_V3_ELEMENT_KINDS.shape:
      return renderShapeElementSvg(rendered);
    case SCENARIO_V3_ELEMENT_KINDS.text:
      return renderTextElementSvg(rendered);
  }

  return assertNever(rendered);
}
