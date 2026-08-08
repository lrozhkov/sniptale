import { expect, it } from 'vitest';

import { createSettings } from './test-support';

it('keeps preset action settings fixtures aligned with shared settings', () => {
  expect(createSettings().skipWebSnapshotSaveDisclosure).toBe(false);
});
