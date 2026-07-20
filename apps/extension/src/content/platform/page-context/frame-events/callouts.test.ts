// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  addCalloutBlurRequestListener,
  addCalloutDeleteListener,
  addCalloutPopoverSettingsChangedListener,
  addFrameCalloutChangedListener,
  dispatchCalloutBlurRequest,
  dispatchCalloutDelete,
  dispatchCalloutPopoverSettingsChanged,
  dispatchFrameCalloutChanged,
} from './callouts';

describe('frame-events callout family', () => {
  it('dispatches and subscribes to callout settings and lifecycle events', () => {
    const changeListener = vi.fn();
    const deleteListener = vi.fn();
    const popoverListener = vi.fn();
    const blurListener = vi.fn();
    const cleanupChange = addFrameCalloutChangedListener(changeListener);
    const cleanupDelete = addCalloutDeleteListener(deleteListener);
    const cleanupPopover = addCalloutPopoverSettingsChangedListener(popoverListener);
    const cleanupBlur = addCalloutBlurRequestListener(blurListener);

    dispatchFrameCalloutChanged({
      frameId: 'frame-1',
      settings: { enabled: true, variant: 'text-only' },
    });
    dispatchCalloutDelete({ frameId: 'frame-1' });
    dispatchCalloutPopoverSettingsChanged({
      frameId: 'frame-2',
      settings: { enabled: true, variant: 'text-only' },
    });
    dispatchCalloutBlurRequest({ frameId: 'frame-2' });

    expect(changeListener).toHaveBeenCalledWith({
      frameId: 'frame-1',
      settings: { enabled: true, variant: 'text-only' },
    });
    expect(deleteListener).toHaveBeenCalledWith({ frameId: 'frame-1' });
    expect(popoverListener).toHaveBeenCalledWith({
      frameId: 'frame-2',
      settings: { enabled: true, variant: 'text-only' },
    });
    expect(blurListener).toHaveBeenCalledWith({ frameId: 'frame-2' });

    cleanupChange();
    cleanupDelete();
    cleanupPopover();
    cleanupBlur();
  });
});
