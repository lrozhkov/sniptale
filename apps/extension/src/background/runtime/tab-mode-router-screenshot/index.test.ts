import { expect, it } from 'vitest';

import * as screenshotStatus from './status';
import {
  disableScreenshotMode as disableScreenshotModeFromOwner,
  disableScreenshotModeForContent as disableScreenshotModeForContentFromOwner,
  enableScreenshotMode as enableScreenshotModeFromOwner,
  enableScreenshotModeGuarded as enableScreenshotModeGuardedFromOwner,
} from './mode';
import * as navigationCleanup from './navigation-cleanup';
import {
  getScreenshotPresetAvailabilities as getScreenshotPresetAvailabilitiesFromOwner,
  handleApplyViewportPreset as handleApplyViewportPresetFromOwner,
  handleReleaseViewportPreset as handleReleaseViewportPresetFromOwner,
} from './viewport';
import {
  buildScreenshotModeStatusResponse,
  cleanupScreenshotModeAfterNavigation,
  disableScreenshotMode,
  disableScreenshotModeForContent,
  enableScreenshotMode,
  enableScreenshotModeGuarded,
  getScreenshotPresetAvailabilities,
  handleApplyViewportPreset,
  handleReleaseViewportPreset,
} from './index';

it('re-exports tab-mode screenshot entrypoints from the owner folder without wrapping them', () => {
  expect(enableScreenshotMode).toBe(enableScreenshotModeFromOwner);
  expect(enableScreenshotModeGuarded).toBe(enableScreenshotModeGuardedFromOwner);
  expect(disableScreenshotMode).toBe(disableScreenshotModeFromOwner);
  expect(disableScreenshotModeForContent).toBe(disableScreenshotModeForContentFromOwner);
  expect(handleApplyViewportPreset).toBe(handleApplyViewportPresetFromOwner);
  expect(handleReleaseViewportPreset).toBe(handleReleaseViewportPresetFromOwner);
  expect(getScreenshotPresetAvailabilities).toBe(getScreenshotPresetAvailabilitiesFromOwner);
  expect(cleanupScreenshotModeAfterNavigation).toBe(
    navigationCleanup.cleanupScreenshotModeAfterNavigation
  );
  expect(buildScreenshotModeStatusResponse).toBe(
    screenshotStatus.buildScreenshotModeStatusResponse
  );
});
