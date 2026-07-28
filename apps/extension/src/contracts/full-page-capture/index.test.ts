import { expect, it } from 'vitest';

import { DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES } from './index';

it('keeps the user-facing full-page defaults explicit and immutable by consumers', () => {
  expect(DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES).toEqual({
    floatingElements: 'once',
    freezeMotion: true,
    preloadLazyContent: true,
  });
});
