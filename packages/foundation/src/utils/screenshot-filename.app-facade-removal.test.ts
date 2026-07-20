import { existsSync } from 'node:fs';

import { expect, it } from 'vitest';

const RETIRED_APP_FILENAME_FACADE_PATH = 'apps/extension/src/platform/content-utils/filename.ts';

it('keeps the app-local screenshot filename wrapper retired', () => {
  expect(existsSync(RETIRED_APP_FILENAME_FACADE_PATH)).toBe(false);
});
