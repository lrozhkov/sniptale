import { existsSync } from 'node:fs';

import { expect, it } from 'vitest';

const RETIRED_APP_STATE_MANAGER_FACADE_PATH =
  'apps/extension/src/composition/persistence/state-manager/state-manager.ts';

it('keeps the app-local state-manager factory facade retired', () => {
  expect(existsSync(RETIRED_APP_STATE_MANAGER_FACADE_PATH)).toBe(false);
});
