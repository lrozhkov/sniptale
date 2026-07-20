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
        setBadgeBackgroundColor: vi.fn(),
        setBadgeText: vi.fn(),
        setTitle: vi.fn(),
      },
    };
    Object.assign(globalThis, { chrome: chromeStub });

    await browserAction.setBadgeBackgroundColor({ color: '#ff0000' });
    await browserAction.setBadgeText({ text: 'REC' });
    await browserAction.setTitle({ title: 'Recording' });

    expect(chromeStub.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#ff0000' });
    expect(chromeStub.action.setBadgeText).toHaveBeenCalledWith({ text: 'REC' });
    expect(chromeStub.action.setTitle).toHaveBeenCalledWith({ title: 'Recording' });
  });
});
