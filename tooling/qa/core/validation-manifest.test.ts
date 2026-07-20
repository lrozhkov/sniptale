import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { QA_RULE_DEFINITIONS } from './qa-steps/definitions.mjs';

const manifest = JSON.parse(
  fs.readFileSync('tooling/configs/qa/validation-manifest.json', 'utf8')
) as {
  tools: Array<{
    tool: string;
    validationMode: string;
    testFiles: string[];
    states: string[];
  }>;
};

function collectToolFiles() {
  const roots = ['tooling/qa/core', 'tooling/qa/guards/architecture', 'tooling/qa/guards/security'];
  roots.push('tooling/qa/guards/quality');
  const deterministicVerifyTools = roots
    .flatMap((root) =>
      fs
        .readdirSync(root)
        .filter(
          (file) =>
            /^verify-.*\.(?:mjs|sh)$/u.test(file) &&
            !/\.helpers\.|\.data\.|\.constants\.|\.rules\.|\.thresholds\.|\.usage\./u.test(file) &&
            file !== 'verify-all.violation-steps.mjs' &&
            file !== 'verify-focused.config.mjs'
        )
    )
    .sort();
  const canonicalControlTools = QA_RULE_DEFINITIONS.filter(
    ({ source }) => source !== 'git' && fs.existsSync(source)
  ).map(({ tool }) => tool);
  return [...new Set([...deterministicVerifyTools, ...canonicalControlTools])].sort();
}

describe('validation manifest', () => {
  it('covers every deterministic verify tool and canonical repository control', () => {
    expect(manifest.tools.map((entry) => entry.tool).sort()).toEqual(collectToolFiles());
  });

  it('requires pass/fail coverage metadata and existing test references', () => {
    expect(new Set(manifest.tools.map(({ tool }) => tool)).size).toBe(manifest.tools.length);
    for (const entry of manifest.tools) {
      expect(entry.validationMode.length).toBeGreaterThan(0);
      expect(entry.states).toContain('pass');
      expect(entry.states).toContain('fail');
      for (const testFile of entry.testFiles) {
        expect(fs.existsSync(testFile)).toBe(true);
      }
    }
  });
});
