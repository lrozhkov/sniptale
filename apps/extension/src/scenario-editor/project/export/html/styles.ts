import { buildScenarioHtmlBaseStyles } from './styles-base';
import { buildScenarioLightboxStyles, buildScenarioResponsiveStyles } from './styles-lightbox';
import { buildScenarioStepStyles } from './styles-steps';

export function buildScenarioHtmlStyles(): string {
  return [
    ...buildScenarioHtmlBaseStyles(),
    ...buildScenarioStepStyles(),
    ...buildScenarioLightboxStyles(),
    ...buildScenarioResponsiveStyles(),
  ].join('');
}
