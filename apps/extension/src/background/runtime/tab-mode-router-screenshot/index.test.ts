import { expect, it } from 'vitest';

import * as screenshotStatus from './status';
import {
  disableScreenshotMode as disableScreenshotModeFromOwner,
  enableScreenshotMode as enableScreenshotModeFromOwner,
} from './mode';
import * as navigationCleanup from './navigation-cleanup';
import { handleSetViewport as handleSetViewportFromOwner } from './viewport';
import {
  buildScreenshotModeStatusResponse,
  cleanupScreenshotModeAfterNavigation,
  disableScreenshotMode,
  enableScreenshotMode,
  handleSetViewport,
} from './index';

it('re-exports tab-mode screenshot entrypoints from the owner folder without wrapping them', () => {
  expect(enableScreenshotMode).toBe(enableScreenshotModeFromOwner);
  expect(disableScreenshotMode).toBe(disableScreenshotModeFromOwner);
  expect(handleSetViewport).toBe(handleSetViewportFromOwner);
  expect(cleanupScreenshotModeAfterNavigation).toBe(
    navigationCleanup.cleanupScreenshotModeAfterNavigation
  );
  expect(buildScreenshotModeStatusResponse).toBe(
    screenshotStatus.buildScreenshotModeStatusResponse
  );
});
