import { expect, it } from 'vitest';

import { createScenarioSessionServiceStub } from './test-support';

it('creates a scenario session service stub with stable default reads', () => {
  const stub = createScenarioSessionServiceStub();

  expect(stub.hasPendingCapture(4)).toBe(false);
  expect(stub.getPendingCapture(4)).toBeNull();
  expect(stub.syncProjectRevision(4)).toBe(0);
  expect(stub.syncProjectRevision(4, { hasActiveProject: true })).toBe(1);
});
