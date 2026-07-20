import { describe, expect, it } from 'vitest';
import { resolveToolbarNavigationLockMode } from '.';

describe('resolveToolbarNavigationLockMode', () => {
  it('keeps full lock while ai-pick is active inside screenshot mode', () => {
    expect(
      resolveToolbarNavigationLockMode({
        highlighterMode: false,
        isCursorMode: false,
        quickEditMode: false,
        screenshotMode: true,
        aiPickMode: true,
      })
    ).toBe(true);
  });

  it('uses links-only lock for plain screenshot mode', () => {
    expect(
      resolveToolbarNavigationLockMode({
        highlighterMode: false,
        isCursorMode: false,
        quickEditMode: false,
        screenshotMode: true,
        aiPickMode: false,
      })
    ).toBe(false);
  });

  it('returns no override when screenshot mode is off', () => {
    expect(
      resolveToolbarNavigationLockMode({
        highlighterMode: false,
        isCursorMode: true,
        quickEditMode: false,
        screenshotMode: true,
        aiPickMode: false,
      })
    ).toBeNull();
  });
});
