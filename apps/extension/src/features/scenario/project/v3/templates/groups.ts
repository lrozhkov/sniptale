export const SCENARIO_TEMPLATE_GROUPS = {
  code: 'code',
  comparison: 'comparison',
  section: 'section',
  summary: 'summary',
  walkthrough: 'walkthrough',
} as const;

type ScenarioTemplateGroup =
  (typeof SCENARIO_TEMPLATE_GROUPS)[keyof typeof SCENARIO_TEMPLATE_GROUPS];

export const SCENARIO_TEMPLATE_GROUP_ORDER = [
  SCENARIO_TEMPLATE_GROUPS.walkthrough,
  SCENARIO_TEMPLATE_GROUPS.section,
  SCENARIO_TEMPLATE_GROUPS.comparison,
  SCENARIO_TEMPLATE_GROUPS.code,
  SCENARIO_TEMPLATE_GROUPS.summary,
] as const satisfies readonly ScenarioTemplateGroup[];
