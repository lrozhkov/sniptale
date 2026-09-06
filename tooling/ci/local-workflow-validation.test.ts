import { expect, it } from 'vitest';

import { requiresLocalWorkflowValidation } from './local-workflow-validation.mjs';

it.each([
  '.github/workflows/proof.yml',
  '.github/actions/setup-locked-node/action.yml',
  'tooling/ci/fixtures/actionlint/invalid.yml',
  'tooling/ci/fixtures/actionlint/valid.yml',
  'tooling/ci/validate-workflows.mjs',
  'tooling/ci/local-workflow-validation.mjs',
  'tooling/configs/ci/toolchain.lock.json',
  'tooling/configs/ci/github-policy.json',
  'tooling/configs/ci/trusted-admission-policy.json',
])('runs local workflow validation for %s', (file) => {
  expect(requiresLocalWorkflowValidation([file])).toBe(true);
});

it('skips local workflow validation for product-only candidates', () => {
  expect(requiresLocalWorkflowValidation(['apps/extension/src/popup/index.tsx'])).toBe(false);
});
