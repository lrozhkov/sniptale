import { describe, expect, it } from 'vitest';

import { QA_RULE_DEFINITIONS } from '../core/qa-steps/definitions.mjs';
import { RULE_REGISTRY } from './rule-registry.mjs';

describe('rule registry', () => {
  it('is the canonical executable definition projection, not a second metadata registry', () => {
    expect(RULE_REGISTRY).toBe(QA_RULE_DEFINITIONS);
  });

  it('keeps lifecycle and remediation metadata for every rule family', () => {
    const allowedNoise = new Set(['low', 'medium', 'high']);
    const allowedStatus = new Set(['advisory', 'blocking', 'release-only', 'retired', 'trial']);

    for (const entry of RULE_REGISTRY) {
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.toolId.length).toBeGreaterThan(0);
      expect(entry.tool.length).toBeGreaterThan(0);
      expect(entry.owner.length).toBeGreaterThan(0);
      expect(entry.engine.length).toBeGreaterThan(0);
      expect(entry.truthSource.length).toBeGreaterThan(0);
      expect(entry.remediation.length).toBeGreaterThan(0);
      expect(entry.ruleDoc.length).toBeGreaterThan(0);
      expect(allowedStatus.has(entry.status)).toBe(true);
      expect(allowedNoise.has(entry.expectedNoise)).toBe(true);
      expect(entry.runsIn.length).toBeGreaterThan(0);
      expect(entry.lanes.length).toBeGreaterThan(0);
    }
  });

  it('represents harness checks as first-class prerequisite evidence', () => {
    const coverage = RULE_REGISTRY.find(
      (entry) => entry.id === 'qa.rule.qa-rule-coverage-contract'
    );

    expect(coverage?.runsIn).toContain('qa:release-harness');
    expect(coverage?.requiredBy).toEqual(
      expect.arrayContaining([
        'qa:release-harness',
        'qa:checkpoint',
        'qa:build',
        'qa:release',
        'qa:closeout',
      ])
    );
  });
});
