import type { ScenarioTemplateDefinition } from '@sniptale/runtime-contracts/scenario/types/v3';
import { BUNDLED_SCENARIO_TEMPLATE_DEFINITIONS } from './bundled.data.ts';
import { SCENARIO_TEMPLATE_GROUP_ORDER } from './groups';

function getGroupOrderIndex(definition: ScenarioTemplateDefinition): number {
  const groupIndex = SCENARIO_TEMPLATE_GROUP_ORDER.findIndex((group) => group === definition.group);

  return groupIndex >= 0 ? groupIndex : Number.MAX_SAFE_INTEGER;
}

function compareTemplateDefinitions(
  left: ScenarioTemplateDefinition,
  right: ScenarioTemplateDefinition
): number {
  return (
    getGroupOrderIndex(left) - getGroupOrderIndex(right) || left.catalogRank - right.catalogRank
  );
}

export function listBundledScenarioTemplates(): readonly ScenarioTemplateDefinition[] {
  return [...BUNDLED_SCENARIO_TEMPLATE_DEFINITIONS].sort(compareTemplateDefinitions);
}

export function getBundledScenarioTemplate(templateId: string): ScenarioTemplateDefinition | null {
  return (
    BUNDLED_SCENARIO_TEMPLATE_DEFINITIONS.find((template) => template.templateId === templateId) ??
    null
  );
}
