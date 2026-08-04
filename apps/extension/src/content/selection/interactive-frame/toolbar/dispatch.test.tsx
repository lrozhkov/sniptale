// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  addFrameCalloutChangedListener,
  addFrameStepBadgeChangedListener,
} from '../../../platform/page-context/frame-events';
import {
  createSharedToolbarClickHandlers,
  dispatchCalloutEnable,
  dispatchStepBadgeEnable,
} from './dispatch';

describe('interactive frame toolbar dispatch', () => {
  it('dispatches step-badge and callout enable events through the shared event seam', () => {
    const stepBadgeListener = vi.fn();
    const calloutListener = vi.fn();
    const cleanupStepBadge = addFrameStepBadgeChangedListener(stepBadgeListener);
    const cleanupCallout = addFrameCalloutChangedListener(calloutListener);

    dispatchStepBadgeEnable('frame-1');
    dispatchCalloutEnable('frame-2');

    expect(stepBadgeListener).toHaveBeenCalledWith({
      frameId: 'frame-1',
      settings: { enabled: true },
    });
    expect(calloutListener).toHaveBeenCalledWith({
      frameId: 'frame-2',
      settings: { enabled: true },
    });

    cleanupStepBadge();
    cleanupCallout();
  });

  it('keeps toolbar click handlers as thin orchestration wrappers', () => {
    const previousAnchor = document.createElement('button');
    const clickedButton = document.createElement('button');
    const props = {
      effectMode: 'border',
      handleDelete: vi.fn(),
      handleEffectButtonClick: vi.fn(),
      handleStartEditing: vi.fn(),
      closePopover: vi.fn(),
      popoverAnchorRef: { current: previousAnchor },
    };
    const handlers = createSharedToolbarClickHandlers(props as never);
    const event = {
      currentTarget: clickedButton,
      nativeEvent: { stopImmediatePropagation: vi.fn() },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as never;

    handlers.handleEffectClick('blur')(event);

    expect(props.handleEffectButtonClick).toHaveBeenCalledWith('blur');
    expect(props.popoverAnchorRef.current).toBe(clickedButton);
    expect(props.closePopover).not.toHaveBeenCalled();
  });
});
