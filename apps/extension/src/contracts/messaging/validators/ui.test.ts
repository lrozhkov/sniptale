import { expect, it } from 'vitest';

import { isCaptureActionType, isQuickActionOverlay, isShowToastPayload } from './ui';

it('accepts only supported capture action values', () => {
  expect(isCaptureActionType('copy')).toBe(true);
  expect(isCaptureActionType('download')).toBe(false);
});

it('validates quick-action overlays and toast payloads with optional fields', () => {
  expect(
    isQuickActionOverlay({
      afterCapture: 'copy',
      delaySeconds: 3,
      exitAfterCapture: false,
      imageFormat: 'png',
      imageQuality: 90,
    })
  ).toBe(true);
  expect(
    isQuickActionOverlay({
      afterCapture: 'copy',
      delaySeconds: '3',
      exitAfterCapture: false,
      imageFormat: 'png',
      imageQuality: 90,
    })
  ).toBe(false);
  expect(isShowToastPayload({ message: 'Saved', title: 'Done', type: 'success' })).toBe(true);
  expect(isShowToastPayload({ message: 7 })).toBe(false);
});
