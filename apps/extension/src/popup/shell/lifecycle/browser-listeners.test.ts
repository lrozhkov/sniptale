// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  subscribeToActivatedMock: vi.fn(),
  subscribeToUpdatedMock: vi.fn(),
  unsubscribeActivatedMock: vi.fn(),
  unsubscribeUpdatedMock: vi.fn(),
  activatedListener: undefined as (() => void) | undefined,
  updatedListener: undefined as
    | ((tabId: number, changeInfo: { status?: string; url?: string }, tab: chrome.tabs.Tab) => void)
    | undefined,
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: {
    subscribeToActivated: mocks.subscribeToActivatedMock,
    subscribeToUpdated: mocks.subscribeToUpdatedMock,
  },
}));

import { registerPopupLifecycleBrowserListeners } from './browser-listeners';

function createParams() {
  return {
    clearAppliedViewportAuthority: vi.fn(),
    refreshActiveTabCapabilities: vi.fn(async () => undefined),
    refreshGalleryStatus: vi.fn(async () => undefined),
  };
}

beforeEach(() => {
  mocks.activatedListener = undefined;
  mocks.updatedListener = undefined;
  mocks.subscribeToActivatedMock.mockReset();
  mocks.subscribeToUpdatedMock.mockReset();
  mocks.unsubscribeActivatedMock.mockReset();
  mocks.unsubscribeUpdatedMock.mockReset();

  mocks.subscribeToActivatedMock.mockImplementation((listener: () => void) => {
    mocks.activatedListener = listener;
    return mocks.unsubscribeActivatedMock;
  });
  mocks.subscribeToUpdatedMock.mockImplementation(
    (
      listener: (
        tabId: number,
        changeInfo: { status?: string; url?: string },
        tab: chrome.tabs.Tab
      ) => void
    ) => {
      mocks.updatedListener = listener;
      return mocks.unsubscribeUpdatedMock;
    }
  );
});

describe('registerPopupLifecycleBrowserListeners', () => {
  it('subscribes to focus, activation, and tab updates and cleans them up', () => {
    const params = createParams();
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const cleanup = registerPopupLifecycleBrowserListeners(() => params);

    window.dispatchEvent(new Event('focus'));
    mocks.activatedListener?.();
    mocks.updatedListener?.(1, { status: 'complete' }, { active: true } as chrome.tabs.Tab);
    mocks.updatedListener?.(1, { status: 'loading' }, { active: false } as chrome.tabs.Tab);

    expect(params.refreshActiveTabCapabilities).toHaveBeenCalledTimes(3);
    expect(params.refreshGalleryStatus).toHaveBeenCalledTimes(1);
    expect(params.clearAppliedViewportAuthority).toHaveBeenCalledTimes(2);

    cleanup();

    expect(removeSpy).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(mocks.unsubscribeActivatedMock).toHaveBeenCalledTimes(1);
    expect(mocks.unsubscribeUpdatedMock).toHaveBeenCalledTimes(1);
  });
});
