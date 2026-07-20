export { BUNDLED_SCENARIO_TEMPLATE_DEFINITIONS } from './bundled.data.ts';
export { SCENARIO_TEMPLATE_GROUP_ORDER, SCENARIO_TEMPLATE_GROUPS } from './groups';
export { getBundledScenarioTemplate, listBundledScenarioTemplates } from './registry';
export { validateScenarioTemplatePack } from './import-pack';
export type { ScenarioTemplatePackValidationResult, ScenarioRejectedTemplate } from './import-pack';
export { isScenarioTemplateDefinitionLike } from './validation';
export {
  applyScenarioTemplateToSlide,
  instantiateScenarioTemplateSlide,
  planScenarioTemplateApplication,
} from './apply';
export type { ScenarioTemplateApplicationPlan, ScenarioTemplateApplyResult } from './apply';
