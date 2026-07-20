// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const iframeUtilsMocks = vi.hoisted(() => ({
  addEventListenerToAllWindowsDynamic: vi.fn(),
  addScrollListenersToAllWindows: vi.fn(),
  getAccessibleIframes: vi.fn(),
}));

vi.mock('../../platform/frame', () => iframeUtilsMocks);

import { registerQuickEditModeListeners } from './listeners';

beforeEach(() => {
  iframeUtilsMocks.addEventListenerToAllWindowsDynamic.mockReset();
  iframeUtilsMocks.addScrollListenersToAllWindows.mockReset();
  iframeUtilsMocks.getAccessibleIframes.mockReset();
  iframeUtilsMocks.addEventListenerToAllWindowsDynamic.mockReturnValue(vi.fn());
  iframeUtilsMocks.addScrollListenersToAllWindows.mockReturnValue(vi.fn());
  iframeUtilsMocks.getAccessibleIframes.mockReturnValue([document.createElement('iframe')]);
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('quick-edit-runtime listeners', () => {
  it('registers window listeners and reports accessible iframe count', () => {
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
    const registration = registerQuickEditModeListeners({
      handleBlur: vi.fn(),
      handleClick: vi.fn(),
      handleKeyDown: vi.fn(),
      handleMouseLeave: vi.fn(),
      handleMouseMove: vi.fn(),
      handleOutsideClick: vi.fn(),
      hideHoverOverlay: vi.fn(),
    });

    expect(iframeUtilsMocks.addEventListenerToAllWindowsDynamic).toHaveBeenCalledTimes(5);
    expect(iframeUtilsMocks.addScrollListenersToAllWindows).toHaveBeenCalledOnce();
    expect(registration.iframeCount).toBe(1);

    registration.cleanup();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('mouseleave', expect.any(Function));
  });
});
