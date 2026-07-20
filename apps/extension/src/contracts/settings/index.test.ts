import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  SCREENSHOT_MODE_COLORS,
  type ContentToolbarDisplayMode,
  type QuickActionScreenshotMode,
  type SettingsPatch,
} from './index';

describe('settings contracts', () => {
  it('defines one design token for every screenshot mode', () => {
    expect(Object.keys(SCREENSHOT_MODE_COLORS).sort()).toEqual(['full', 'selection', 'visible']);
    expect(new Set(Object.values(SCREENSHOT_MODE_COLORS)).size).toBe(3);
  });

  it('keeps toolbar and patch boundary variants narrow', () => {
    expectTypeOf<ContentToolbarDisplayMode>().toEqualTypeOf<'horizontal' | 'vertical'>();
    expectTypeOf<QuickActionScreenshotMode>().toEqualTypeOf<'visible' | 'full' | 'selection'>();
    expectTypeOf<SettingsPatch['contextMenu']>().not.toEqualTypeOf<unknown>();
  });
});
