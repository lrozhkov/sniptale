import { existsSync } from 'node:fs';

import { expect, it } from 'vitest';

const RETIRED_APP_MEMORY_ADAPTER_FACADE_PATH =
  'apps/extension/src/composition/persistence/state-manager/memory-adapter.ts';

it('keeps the app-local memory-adapter facade retired', () => {
  expect(existsSync(RETIRED_APP_MEMORY_ADAPTER_FACADE_PATH)).toBe(false);
});
