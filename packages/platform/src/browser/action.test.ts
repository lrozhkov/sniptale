import { afterEach, describe, expect, it, vi } from 'vitest';

import { browserAction } from './action';

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, 'chrome');
});

describe('browser action adapters', () => {
  it('delegates badge and title updates to the shared browser action seam', async () => {
    const chromeStub = {
      action: {
        getPopup: vi.fn().mockResolvedValue('popup.html'),
        setPopup: vi.fn().mockResolvedValue(undefined),
        openPopup: vi.fn(),
        setIcon: vi.fn(),
        setBadgeBackgroundColor: vi.fn(),
        setBadgeText: vi.fn(),
        setTitle: vi.fn(),
      },
    };
    Object.assign(globalThis, { chrome: chromeStub });

    expect(await browserAction.getPopup({ tabId: 12 })).toBe('popup.html');
    await browserAction.setPopup({ tabId: 12, popup: 'popup.html?recordingSetup=1' });
    await browserAction.openPopup({ windowId: 8 });
    await browserAction.openPopup();
    await browserAction.setIcon({ path: 'icons/icon-16.png' });
    await browserAction.setBadgeBackgroundColor({ color: '#ff0000' });
    await browserAction.setBadgeText({ text: 'REC' });
    await browserAction.setTitle({ title: 'Recording' });

    expect(chromeStub.action.openPopup).toHaveBeenCalledWith({ windowId: 8 });
    expect(chromeStub.action.getPopup).toHaveBeenCalledExactlyOnceWith({ tabId: 12 });
    expect(chromeStub.action.setPopup).toHaveBeenCalledExactlyOnceWith({
      tabId: 12,
      popup: 'popup.html?recordingSetup=1',
    });
    expect(chromeStub.action.openPopup).toHaveBeenNthCalledWith(2);
    expect(chromeStub.action.setIcon).toHaveBeenCalledWith({ path: 'icons/icon-16.png' });
    expect(chromeStub.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#ff0000' });
    expect(chromeStub.action.setBadgeText).toHaveBeenCalledWith({ text: 'REC' });
    expect(chromeStub.action.setTitle).toHaveBeenCalledWith({ title: 'Recording' });
  });
});
