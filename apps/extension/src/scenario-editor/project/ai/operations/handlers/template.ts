import {
  applyScenarioTemplateToSlide,
  isScenarioTemplateDefinitionLike,
} from '../../../../../features/scenario/project/v3/templates';
import type {
  ScenarioSlide,
  ScenarioTemplateDefinition,
} from '@sniptale/runtime-contracts/scenario/types/v3';

export function applyScenarioAiTemplate(args: {
  confirmed: boolean;
  slide: ScenarioSlide;
  template: ScenarioTemplateDefinition;
}): ScenarioSlide | null {
  if (!isScenarioTemplateDefinitionLike(args.template)) {
    return null;
  }

  const result = applyScenarioTemplateToSlide(args);
  return result.status === 'applied' ? result.slide : null;
}
