import { SCENARIO_TEMPLATE_GROUP_ORDER } from '../../../features/scenario/project/v3/templates';
import type { ScenarioTemplateDefinition } from '@sniptale/runtime-contracts/scenario/types/v3';

interface ScenarioTemplatePickerGroup {
  group: string;
  templates: ScenarioTemplateDefinition[];
}

export function groupScenarioTemplates(
  templates: readonly ScenarioTemplateDefinition[]
): ScenarioTemplatePickerGroup[] {
  const groups = new Map<string, ScenarioTemplateDefinition[]>();

  templates.forEach((template) => {
    groups.set(template.group, [...(groups.get(template.group) ?? []), template]);
  });

  return [...groups.entries()]
    .map(([group, groupTemplates]) => ({ group, templates: groupTemplates }))
    .sort((left, right) => getGroupIndex(left.group) - getGroupIndex(right.group));
}

function getGroupIndex(group: string) {
  const index = SCENARIO_TEMPLATE_GROUP_ORDER.findIndex((candidate) => candidate === group);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}
