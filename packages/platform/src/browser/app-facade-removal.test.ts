import { existsSync } from 'node:fs';

import { expect, it } from 'vitest';

const RETIRED_APP_BROWSER_FACADE_PATH = 'apps/extension/src/platform/browser/index.ts';

it('keeps the broad app-local browser facade retired', () => {
  expect(existsSync(RETIRED_APP_BROWSER_FACADE_PATH)).toBe(false);
});
