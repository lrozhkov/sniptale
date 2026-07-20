import { expect, it } from 'vitest';

import { createStateManager } from '@sniptale/platform/data/state-manager';
import { createMemoryStateDomainAdapter } from '@sniptale/platform/data/state-manager/memory-adapter';
import { stateManager } from './index';

it('composes the app singleton from the package-owned state manager', async () => {
  expect(stateManager).toBeDefined();

  const manager = createStateManager();
  manager.registerDomain('package.integration', {
    adapter: createMemoryStateDomainAdapter([['first', 1]]),
  });
  await expect(manager.read('package.integration', 'first')).resolves.toBe(1);
});
