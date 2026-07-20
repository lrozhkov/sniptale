import { expect, it } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import {
  shouldRefreshViewportRecordingAfterNavigation,
  shouldRestoreCropOverlayAfterNavigation,
} from './predicates';

it('detects viewport refresh tabs only for viewport emulation', () => {
  expect(shouldRefreshViewportRecordingAfterNavigation(1, 1, CaptureMode.VIEWPORT_EMULATION)).toBe(
    true
  );
  expect(shouldRefreshViewportRecordingAfterNavigation(1, 2, CaptureMode.VIEWPORT_EMULATION)).toBe(
    false
  );
  expect(shouldRefreshViewportRecordingAfterNavigation(1, 1, CaptureMode.TAB_CROP)).toBe(false);
});

it('detects crop overlay restore tabs only for tab crop mode', () => {
  expect(shouldRestoreCropOverlayAfterNavigation(1, 1, CaptureMode.TAB_CROP)).toBe(true);
  expect(shouldRestoreCropOverlayAfterNavigation(1, 2, CaptureMode.TAB_CROP)).toBe(false);
  expect(shouldRestoreCropOverlayAfterNavigation(1, 1, CaptureMode.VIEWPORT_EMULATION)).toBe(false);
});
