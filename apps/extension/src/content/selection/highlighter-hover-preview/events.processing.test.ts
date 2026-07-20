// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  handleFrozenHoverPreview,
  shouldIgnoreHighlighterClick,
  shouldSkipHoverProcessing,
} from './events';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function createHoverProcessingProps(
  overrides: Partial<Parameters<typeof shouldSkipHoverProcessing>[0]> = {}
) {
  return {
    event: new MouseEvent('mousemove', { clientX: 20, clientY: 20 }),
    getState: {
      isFrameEditing: () => false,
      isModeEnabled: () => true,
      isPaused: () => false,
      isTooltipVisible: () => false,
    },
    hoverRuntime: {
      lastHoverProcessTime: 0,
      lastHoverX: 0,
      lastHoverY: 0,
    },
    hoverThrottleMs: 100,
    ...overrides,
  };
}

function shouldNotIgnoreRegularClicksWhenUiIsInactive(): void {
  expect(
    shouldIgnoreHighlighterClick({
      eventTarget: document.createElement('button'),
      getState: {
        isModeEnabled: () => true,
        isPaused: () => false,
        isTooltipVisible: () => false,
      },
    })
  ).toBe(false);
}

function shouldSkipHoverProcessingWhenModeIsDisabledOrPaused(): void {
  expect(
    shouldSkipHoverProcessing(
      createHoverProcessingProps({
        getState: {
          isFrameEditing: () => false,
          isModeEnabled: () => false,
          isPaused: () => false,
          isTooltipVisible: () => false,
        },
      })
    )
  ).toBe(true);

  expect(
    shouldSkipHoverProcessing(
      createHoverProcessingProps({
        getState: {
          isFrameEditing: () => false,
          isModeEnabled: () => true,
          isPaused: () => true,
          isTooltipVisible: () => false,
        },
      })
    )
  ).toBe(true);
}

function shouldSkipHoverProcessingWhenEditingOrTooltipIsVisible(): void {
  expect(
    shouldSkipHoverProcessing(
      createHoverProcessingProps({
        getState: {
          isFrameEditing: () => true,
          isModeEnabled: () => true,
          isPaused: () => false,
          isTooltipVisible: () => false,
        },
      })
    )
  ).toBe(true);

  expect(
    shouldSkipHoverProcessing(
      createHoverProcessingProps({
        getState: {
          isFrameEditing: () => false,
          isModeEnabled: () => true,
          isPaused: () => false,
          isTooltipVisible: () => true,
        },
      })
    )
  ).toBe(true);
}

function shouldSkipHoverProcessingForTinyPointerMovement(): void {
  expect(
    shouldSkipHoverProcessing(
      createHoverProcessingProps({
        event: new MouseEvent('mousemove', { clientX: 11, clientY: 11 }),
        hoverRuntime: {
          lastHoverProcessTime: 0,
          lastHoverX: 10,
          lastHoverY: 10,
        },
      })
    )
  ).toBe(true);
}

function shouldRespectHoverThrottleForLargeMovement(): void {
  const nowSpy = vi.spyOn(Date, 'now');
  nowSpy.mockReturnValue(1_050);

  expect(
    shouldSkipHoverProcessing(
      createHoverProcessingProps({
        event: new MouseEvent('mousemove', { clientX: 18, clientY: 18 }),
        hoverRuntime: {
          lastHoverProcessTime: 1_000,
          lastHoverX: 10,
          lastHoverY: 10,
        },
      })
    )
  ).toBe(true);

  nowSpy.mockReturnValue(1_200);

  expect(
    shouldSkipHoverProcessing(
      createHoverProcessingProps({
        event: new MouseEvent('mousemove', { clientX: 18, clientY: 18 }),
        hoverRuntime: {
          lastHoverProcessTime: 1_000,
          lastHoverX: 10,
          lastHoverY: 10,
        },
      })
    )
  ).toBe(false);
}

function shouldLeavePreviewStateUntouchedWhenItIsNotFrozen(): void {
  const hideHoverOverlay = vi.fn();
  const setHoverPreviewFrozen = vi.fn();
  const setLastHoverTarget = vi.fn();
  const setLastHoverX = vi.fn();
  const setLastHoverY = vi.fn();

  expect(
    handleFrozenHoverPreview({
      event: new MouseEvent('mousemove', { clientX: 5, clientY: 6 }),
      hideHoverOverlay,
      hoverRuntime: { isHoverPreviewFrozen: false },
      setHoverPreviewFrozen,
      setLastHoverTarget,
      setLastHoverX,
      setLastHoverY,
    })
  ).toBe(false);

  expect(hideHoverOverlay).not.toHaveBeenCalled();
  expect(setHoverPreviewFrozen).not.toHaveBeenCalled();
}

describe('highlighter hover preview event processing', () => {
  it(
    'does not ignore regular clicks when extension UI is inactive',
    shouldNotIgnoreRegularClicksWhenUiIsInactive
  );
  it(
    'skips hover processing when the mode is disabled or paused',
    shouldSkipHoverProcessingWhenModeIsDisabledOrPaused
  );
  it(
    'skips hover processing when frame editing or tooltip mode is active',
    shouldSkipHoverProcessingWhenEditingOrTooltipIsVisible
  );
  it(
    'skips hover processing for tiny pointer movement',
    shouldSkipHoverProcessingForTinyPointerMovement
  );
  it('respects the hover throttle for larger movement', shouldRespectHoverThrottleForLargeMovement);
  it(
    'leaves preview state untouched when it is not frozen',
    shouldLeavePreviewStateUntouchedWhenItIsNotFrozen
  );
});
