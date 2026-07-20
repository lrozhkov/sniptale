import { expect, it } from 'vitest';

import { stateManager } from './index';

it('exposes one app-local default state-manager owner', () => {
  expect(stateManager).toBeDefined();
});
