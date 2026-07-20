import { expect, it } from 'vitest';

import { captureFullPage as captureFullPageFromOwner } from './workflow';
import { captureFullPage } from './index';

it('re-exports the full-page capture entrypoint from the owner folder without wrapping it', () => {
  expect(captureFullPage).toBe(captureFullPageFromOwner);
});
