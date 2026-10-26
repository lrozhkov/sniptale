import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  SCREENSHOT_MODE_COLORS,
  PAGE_TOOLBAR_REQUIRED_ITEMS,
  isPageToolbarLayoutItem,
  type ContentToolbarDisplayMode,
  type QuickActionScreenshotMode,
  type SettingsPatch,
} from './index';

describe('settings contracts', () => {
  it('defines one design token for every screenshot mode', () => {
    expect(Object.keys(SCREENSHOT_MODE_COLORS).sort()).toEqual([
      'desktop',
      'full',
      'selection',
      'visible',
    ]);
    expect(new Set(Object.values(SCREENSHOT_MODE_COLORS)).size).toBe(4);
  });

  it('keeps toolbar and patch boundary variants narrow', () => {
    expectTypeOf<ContentToolbarDisplayMode>().toEqualTypeOf<'horizontal' | 'vertical'>();
    expectTypeOf<QuickActionScreenshotMode>().toEqualTypeOf<
      'visible' | 'full' | 'selection' | 'desktop'
    >();
    expectTypeOf<SettingsPatch['contextMenu']>().not.toEqualTypeOf<unknown>();
    expectTypeOf<SettingsPatch['fullPageCapture']>().not.toEqualTypeOf<unknown>();
    expectTypeOf<SettingsPatch>().not.toHaveProperty('defaultViewportPresetId');
    expectTypeOf<SettingsPatch>().not.toHaveProperty('saveCapturesToGallery');
  });
});

it('admits protected Restore and existing controls but refuses unknown layout identities', () => {
  expect(PAGE_TOOLBAR_REQUIRED_ITEMS).toContain('history-restore');
  for (const value of ['history-restore', 'capture-visible', 'separator:custom-1'])
    expect(isPageToolbarLayoutItem(value)).toBe(true);
  for (const value of [null, {}, 1, 'unregistered-action', 'separator:', 'separator:<script>'])
    expect(isPageToolbarLayoutItem(value)).toBe(false);
});
