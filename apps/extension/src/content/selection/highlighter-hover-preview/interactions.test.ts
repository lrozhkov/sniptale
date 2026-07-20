// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHoverInteractionHandlers } from './interactions';

function createInteractionProps() {
  const addFrame = vi.fn();
  const hideHoverOverlay = vi.fn();
  const trackingState = {
    hoverRafId: null as number | null,
    isHoverPreviewFrozen: false,
    lastHoverProcessTime: 0,
    lastHoverTarget: null as HTMLElement | null,
    lastHoverX: -1,
    lastHoverY: -1,
  };

  return {
    addFrame,
    hideHoverOverlay,
    props: {
      getCallbacks: () => ({
        addFrame,
        hasFrameForElement: vi.fn(() => false),
      }),
      getState: {
        isFrameEditing: () => false,
        isModeEnabled: () => true,
        isPaused: () => false,
        isTooltipVisible: () => false,
      },
      hoverState: { frameCache: new Map(), frameCacheDirty: false } as never,
      hoverThrottleMs: 100,
      overlayActions: {
        hideHoverOverlay,
        showHoverOverlay: vi.fn(),
      },
      trackingState,
    },
    trackingState,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('highlighter hover preview click interactions', () => {
  it('freezes hover preview after creating a frame from the last hover target', () => {
    const target = document.createElement('button');
    document.body.append(target);

    const { addFrame, hideHoverOverlay, props, trackingState } = createInteractionProps();
    trackingState.lastHoverTarget = target;
    const handlers = createHoverInteractionHandlers(props);
    const event = {
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
      stopPropagation: vi.fn(),
      target,
    } as unknown as MouseEvent;

    handlers.handleClick(event);

    expect(addFrame).toHaveBeenCalledWith(target);
    expect(trackingState.isHoverPreviewFrozen).toBe(true);
    expect(trackingState.lastHoverTarget).toBeNull();
    expect(hideHoverOverlay).toHaveBeenCalledTimes(1);
  });
});

describe('highlighter hover preview leave interactions', () => {
  it('clears the hover target when the cursor leaves the viewport', () => {
    const { hideHoverOverlay, props, trackingState } = createInteractionProps();
    trackingState.lastHoverTarget = document.createElement('div');
    trackingState.hoverRafId = 42;
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const handlers = createHoverInteractionHandlers(props);

    handlers.handleMouseLeave();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
    expect(trackingState.hoverRafId).toBeNull();
    expect(trackingState.lastHoverTarget).toBeNull();
    expect(hideHoverOverlay).toHaveBeenCalledTimes(1);
  });

  it('skips mouse-leave side effects while the mode is disabled', () => {
    const { hideHoverOverlay, props, trackingState } = createInteractionProps();
    trackingState.lastHoverTarget = document.createElement('div');
    const handlers = createHoverInteractionHandlers({
      ...props,
      getState: {
        ...props.getState,
        isModeEnabled: () => false,
      },
    });

    handlers.handleMouseLeave();

    expect(trackingState.lastHoverTarget).not.toBeNull();
    expect(hideHoverOverlay).not.toHaveBeenCalled();
  });
});
