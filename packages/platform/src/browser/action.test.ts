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
        openPopup: vi.fn(),
        setBadgeBackgroundColor: vi.fn(),
        setBadgeText: vi.fn(),
        setTitle: vi.fn(),
      },
    };
    Object.assign(globalThis, { chrome: chromeStub });

    await browserAction.openPopup({ windowId: 8 });
    await browserAction.openPopup();
    await browserAction.setBadgeBackgroundColor({ color: '#ff0000' });
    await browserAction.setBadgeText({ text: 'REC' });
    await browserAction.setTitle({ title: 'Recording' });

    expect(chromeStub.action.openPopup).toHaveBeenCalledWith({ windowId: 8 });
    expect(chromeStub.action.openPopup).toHaveBeenNthCalledWith(2);
    expect(chromeStub.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#ff0000' });
    expect(chromeStub.action.setBadgeText).toHaveBeenCalledWith({ text: 'REC' });
    expect(chromeStub.action.setTitle).toHaveBeenCalledWith({ title: 'Recording' });
  });
});
