import { expect, it } from 'vitest';

import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { CONTENT_RUNTIME_HOST_ID } from './markers';

it('keeps the shim-safe content runtime host id aligned with shared branding', () => {
  expect(CONTENT_RUNTIME_HOST_ID).toBe(CONTENT_ROOT_ID);
});
