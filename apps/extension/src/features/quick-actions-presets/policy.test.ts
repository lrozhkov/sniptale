import { expect, it } from 'vitest';
import {
  assertQuickActionPolicy,
  getAllowedQuickActionAfterCaptureActions,
  isDesktopQuickAction,
  normalizeQuickActionEditorPolicy,
  normalizeQuickActionPolicy,
  normalizeScreenshotCaptureConfigPolicy,
} from './policy';
import type { QuickAction } from '../../contracts/settings';

function action(overrides: Partial<QuickAction> = {}): QuickAction {
  return {
    id: 'test',
    status: true,
    name: 'Test',
    icon: 'Camera',
    screenshotMode: 'visible',
    exitAfterCapture: false,
    ...overrides,
  };
}

it('replaces unavailable desktop clipboard delivery for popup capture configs', () => {
  expect(
    normalizeScreenshotCaptureConfigPolicy({
      screenshotMode: 'desktop',
      viewportPresetId: 'wide',
      delay: 10,
      afterCapture: 'copy',
      imageFormat: 'webp',
      imageQuality: 80,
      exitAfterCapture: true,
    })
  ).toEqual({
    screenshotMode: 'desktop',
    viewportPresetId: null,
    delay: null,
    afterCapture: 'download_default',
    imageFormat: 'webp',
    imageQuality: 80,
    exitAfterCapture: false,
  });
});

it('applies quick-action field and sink policy for tab and desktop modes', () => {
  expect(isDesktopQuickAction(action())).toBe(false);
  expect(getAllowedQuickActionAfterCaptureActions(action())).toBeNull();
  const desktop = action({
    screenshotMode: 'desktop',
    viewportPresetId: 'wide',
    delay: 10,
    afterCapture: 'copy',
    imageFormat: 'webp',
    imageQuality: 80,
    exitAfterCapture: true,
  });
  expect(isDesktopQuickAction(desktop)).toBe(true);
  expect(getAllowedQuickActionAfterCaptureActions(desktop)?.has('copy')).toBe(false);
  expect(normalizeQuickActionPolicy(desktop)).toMatchObject({
    afterCapture: 'download_default',
    viewportPresetId: null,
    delay: null,
    imageFormat: 'webp',
    imageQuality: 80,
    exitAfterCapture: false,
  });
  expect(normalizeQuickActionPolicy(action()).afterCapture).toBe('download_default');
});

it('normalizes editor fallback and rejects only invalid desktop sinks at runtime', () => {
  const invalid = action({ screenshotMode: 'desktop', afterCapture: 'scenario' });
  expect(normalizeQuickActionEditorPolicy(invalid).afterCapture).toBe('download_default');
  expect(() => assertQuickActionPolicy(invalid)).toThrow('unavailable');
  expect(() =>
    assertQuickActionPolicy(action({ screenshotMode: 'desktop', afterCapture: 'copy' }))
  ).toThrow('unavailable');
  expect(() => assertQuickActionPolicy(action({ afterCapture: 'scenario' }))).not.toThrow();
  expect(normalizeQuickActionEditorPolicy(action({ afterCapture: 'edit' })).afterCapture).toBe(
    'edit'
  );
});
