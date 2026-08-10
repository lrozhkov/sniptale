import { describe, expect, it } from 'vitest';
import { resolveToolbarNavigationLockMode } from '.';

describe('resolveToolbarNavigationLockMode', () => {
  it('keeps full lock while ai-pick is active inside screenshot mode', () => {
    expect(
      resolveToolbarNavigationLockMode({
        designReviewMode: false,
        drawingMode: false,
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
        designReviewMode: false,
        drawingMode: false,
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
        designReviewMode: false,
        drawingMode: false,
        highlighterMode: false,
        isCursorMode: true,
        quickEditMode: false,
        screenshotMode: true,
        aiPickMode: false,
      })
    ).toBeNull();
  });

  it('uses links-only lock while Design Review owns page picking', () => {
    expect(
      resolveToolbarNavigationLockMode({
        aiPickMode: false,
        designReviewMode: true,
        drawingMode: false,
        highlighterMode: false,
        isCursorMode: false,
        quickEditMode: false,
        screenshotMode: true,
      })
    ).toBe(false);
  });

  it('uses links-only lock while Annotation owns page picking', () => {
    expect(
      resolveToolbarNavigationLockMode({
        aiPickMode: false,
        designReviewMode: false,
        drawingMode: false,
        highlighterMode: true,
        isCursorMode: false,
        quickEditMode: false,
        screenshotMode: true,
      })
    ).toBe(false);
  });

  it('uses links-only lock while Quick Edit owns text-block picking', () => {
    expect(
      resolveToolbarNavigationLockMode({
        aiPickMode: false,
        designReviewMode: false,
        drawingMode: false,
        highlighterMode: false,
        isCursorMode: false,
        quickEditMode: true,
        screenshotMode: true,
      })
    ).toBe(false);
  });

  it('removes the generic navigation overlay while Drawing owns pointer input', () => {
    expect(
      resolveToolbarNavigationLockMode({
        aiPickMode: false,
        designReviewMode: false,
        drawingMode: true,
        highlighterMode: false,
        isCursorMode: false,
        quickEditMode: false,
        screenshotMode: true,
      })
    ).toBeNull();
  });
});
