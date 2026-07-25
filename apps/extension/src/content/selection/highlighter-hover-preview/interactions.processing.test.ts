// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleFrozenHoverPreview, shouldSkipHoverProcessing } from './interactions';
import { createHoverSession } from './session';

afterEach(() => {
  vi.restoreAllMocks();
});

function createSkipProps() {
  return {
    event: new MouseEvent('mousemove', { clientX: 20, clientY: 20 }),
    getState: {
      isFrameEditing: () => false,
      isModeEnabled: () => true,
      isPaused: () => false,
    },
    hoverThrottleMs: 100,
    session: createHoverSession(),
  };
}

describe('highlighter hover processing policy', () => {
  it('skips disabled, paused, and editing states', () => {
    for (const state of [{ isModeEnabled: false }, { isPaused: true }, { isFrameEditing: true }]) {
      const props = createSkipProps();
      props.getState = {
        isFrameEditing: () => state.isFrameEditing ?? false,
        isModeEnabled: () => state.isModeEnabled ?? true,
        isPaused: () => state.isPaused ?? false,
      };
      expect(shouldSkipHoverProcessing(props)).toBe(true);
    }
  });

  it('skips tiny moves and applies the time throttle to larger moves', () => {
    const props = createSkipProps();
    props.session.lastHoverX = 19;
    props.session.lastHoverY = 19;
    expect(shouldSkipHoverProcessing(props)).toBe(true);

    props.session.lastHoverX = 10;
    props.session.lastHoverY = 10;
    props.session.lastHoverProcessTime = 1_000;
    vi.spyOn(Date, 'now').mockReturnValueOnce(1_050).mockReturnValueOnce(1_200);
    expect(shouldSkipHoverProcessing(props)).toBe(true);
    expect(shouldSkipHoverProcessing(props)).toBe(false);
  });

  it('leaves an unfrozen session untouched', () => {
    const session = createHoverSession();
    const hideHoverOverlay = vi.fn();

    expect(
      handleFrozenHoverPreview({
        event: new MouseEvent('mousemove', { clientX: 5, clientY: 6 }),
        hideHoverOverlay,
        session,
      })
    ).toBe(false);
    expect(hideHoverOverlay).not.toHaveBeenCalled();
  });

  it('unfreezes, hides, and records the first resumed pointer position', () => {
    const session = createHoverSession();
    const hideHoverOverlay = vi.fn();
    session.isHoverPreviewFrozen = true;
    session.lastHoverTarget = document.createElement('div');

    expect(
      handleFrozenHoverPreview({
        event: new MouseEvent('mousemove', { clientX: 22, clientY: 14 }),
        hideHoverOverlay,
        session,
      })
    ).toBe(true);
    expect(session).toMatchObject({
      isHoverPreviewFrozen: false,
      lastHoverTarget: null,
      lastHoverX: 22,
      lastHoverY: 14,
    });
    expect(hideHoverOverlay).toHaveBeenCalledOnce();
  });
});
