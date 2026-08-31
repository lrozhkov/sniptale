import { describe, expect, it } from 'vitest';

import { createStructuralRiskReport } from './report.mjs';

describe('structural remediation guidance', () => {
  it('explains the state dimension without prescribing a mechanical split', () => {
    const file = 'apps/extension/src/content/selection/state.ts';
    const report = createStructuralRiskReport({
      files: [file],
      getCurrentSource: () => `export function update(first, second, third) {
        first.ready = true;
        second.ready = true;
        third.ready = true;
      }`,
      getPreviousSource: () => 'export function update() { return true; }',
    });
    const finding = report.advisories.find(({ rule }) => rule === 'structural-file-risk');

    expect(finding?.remediationHint).toContain('state signals share one receiver');
    expect(finding?.remediationHint).toContain('Keep cohesive transaction');
    expect(finding?.remediationHint).not.toContain('Split by independent change reason');
  });
});
