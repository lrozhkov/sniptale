import { expect, it } from 'vitest';

import { createTempRoot, withCwd, writeFile } from './test-helpers';
import { collectQaRuleCoverageContractViolations } from './verify-qa-rule-coverage-contract.mjs';

function rules(violations: { rule: string }[]) {
  return violations.map((violation) => violation.rule);
}

function writeContractFiles(root: string, tool: string) {
  writeFile(
    root,
    'tooling/configs/qa/validation-manifest.json',
    JSON.stringify({ tools: [{ tool }] })
  );
}

it('rejects guardrail rules without collector, runner, cli, validation, and registry coverage', async () => {
  const root = createTempRoot('qa-rule-contract-bad-');
  writeContractFiles(root, 'verify-other-rule.mjs');
  const bad = writeFile(
    root,
    'tooling/qa/core/verify-example-rule.mjs',
    '// QA_RULE_CONTRACT_REQUIRED: true\nexport function collectExampleViolations() { return []; }\n'
  );

  const violations = await withCwd(root, () => collectQaRuleCoverageContractViolations([bad]));

  expect(rules(violations)).toEqual(
    expect.arrayContaining([
      'qa-rule-contract-missing-runner',
      'qa-rule-contract-missing-cli',
      'qa-rule-contract-missing-validation',
      'qa-rule-contract-missing-registry',
    ])
  );
});

it('accepts guardrail rules with the full QA rule contract', async () => {
  const root = createTempRoot('qa-rule-contract-good-');
  writeContractFiles(root, 'verify-boundary-casts.mjs');
  const good = writeFile(
    root,
    'tooling/qa/core/verify-boundary-casts.mjs',
    [
      'export function collectExampleViolations() { return []; }',
      'export function runExampleCheck({ files = [], scope = "workspace" } = {}) {',
      '  return { files, scope, skipped: false, violations: [] };',
      '}',
      'runIfExecutedAsScript(import.meta.url, { collectViolations: collectExampleViolations });',
    ].join('\n')
  );

  await expect(
    withCwd(root, () => collectQaRuleCoverageContractViolations([good]))
  ).resolves.toEqual([]);
});

it('retains the QA rule contract for a non-mjs executable rule', async () => {
  const root = createTempRoot('qa-rule-contract-typescript-');
  writeContractFiles(root, 'verify-typescript-rule.ts');
  const unregistered = writeFile(
    root,
    'tooling/qa/core/verify-typescript-rule.ts',
    [
      '// QA_RULE_CONTRACT_REQUIRED: true',
      'export function collectTypescriptViolations() { return []; }',
      'export function runTypescriptCheck() { return { violations: [] }; }',
      'runIfExecutedAsScript(import.meta.url, { collectViolations: collectTypescriptViolations });',
    ].join('\n')
  );

  const violations = await withCwd(root, () =>
    collectQaRuleCoverageContractViolations([unregistered])
  );

  expect(rules(violations)).toEqual(['qa-rule-contract-missing-registry']);
});
