import { existsSync } from 'node:fs';

import { expect, it } from 'vitest';

const RETIRED_APP_STATE_MANAGER_INDEX_PATH =
  'apps/extension/src/composition/persistence/state-manager/index.ts';
const RETIRED_APP_STATE_MANAGER_SERVICE_PATH =
  'apps/extension/src/composition/persistence/state-manager/service.ts';

it('keeps broad app-local state-manager facades retired', () => {
  for (const path of [
    RETIRED_APP_STATE_MANAGER_INDEX_PATH,
    RETIRED_APP_STATE_MANAGER_SERVICE_PATH,
  ]) {
    expect(existsSync(path)).toBe(false);
  }
});
