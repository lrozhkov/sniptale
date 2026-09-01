import { expect, it } from 'vitest';

import { runForwardingModuleDriftCheck } from './check.mjs';
import { FORWARDING_MODULE_DRIFT_POLICY } from './policy.data.mjs';

it('keeps the live exemption registry aligned with the repository graph', () => {
  const result = runForwardingModuleDriftCheck({
    files: ['tooling/qa/guards/architecture/forwarding-module-drift/policy.data.mjs'],
    policy: FORWARDING_MODULE_DRIFT_POLICY,
  });

  expect(result.violations).toEqual([]);
});
