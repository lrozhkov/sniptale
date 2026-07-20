import { expect, it } from 'vitest';

import { routeTabModeMessage as routeTabModeMessageFromOwner } from './router';
import { routeTabModeMessage } from './index';

it('re-exports the tab-mode router entrypoint from the owner folder without wrapping it', () => {
  expect(routeTabModeMessage).toBe(routeTabModeMessageFromOwner);
});
