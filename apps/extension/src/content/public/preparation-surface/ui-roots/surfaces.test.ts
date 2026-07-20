import { expect, it } from 'vitest';

import { initializeContentUiRoots as initializePlatformContentUiRoots } from '../../../platform/dom-host/ui-roots';
import { initializeContentUiRoots } from './surfaces';

it('keeps the public preparation surface bound to the canonical DOM-host owner', () => {
  expect(initializeContentUiRoots).toBe(initializePlatformContentUiRoots);
});
