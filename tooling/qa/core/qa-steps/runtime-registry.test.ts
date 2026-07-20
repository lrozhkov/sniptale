import { expect, it } from 'vitest';

import { QA_RULE_DEFINITIONS } from './definitions.mjs';
import { OBSERVED_QA_RULES } from './runtime-registry.mjs';

it('keeps the lightweight wrapper registry aligned with the executable rule catalog', () => {
  for (const rule of OBSERVED_QA_RULES) {
    const canonical = QA_RULE_DEFINITIONS.find((candidate) => candidate.label === rule.label);
    expect(canonical, rule.label).toBeDefined();
    expect(rule).toMatchObject({
      id: canonical?.id,
      remediation: canonical?.remediation,
      ruleDoc: canonical?.ruleDoc,
      tool: canonical?.tool,
    });
  }

  const observedLabels = new Set(OBSERVED_QA_RULES.map((rule) => rule.label));
  const canonicalWrapperIds = new Set([
    'qa:advisory',
    'qa:audit',
    'qa:build',
    'qa:checkpoint',
    'qa:closeout',
    'qa:e2e',
    'qa:preflight',
    'qa:release',
    'qa:release-harness',
  ]);
  for (const canonical of QA_RULE_DEFINITIONS.filter((rule) =>
    rule.runsIn.some((wrapperId) => canonicalWrapperIds.has(wrapperId))
  )) {
    expect(observedLabels.has(canonical.label), canonical.label).toBe(true);
  }
});
