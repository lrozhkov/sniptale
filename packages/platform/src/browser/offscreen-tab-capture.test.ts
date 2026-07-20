import { afterEach, describe, expect, it } from 'vitest';
import { browserOffscreen } from './offscreen';
import { browserTabCapture } from './tab-capture';
import { createChromeStub } from './test-fixtures';

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'chrome');
});

function installChromeStub(chromeStub: ReturnType<typeof createChromeStub>) {
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: chromeStub,
    writable: true,
  });
}

describe('browser offscreen/tab-capture adapters', () => {
  it('delegates offscreen document creation to the shared adapter', async () => {
    const chromeStub = createChromeStub();
    const createParameters = {
      justification: 'test',
      reasons: ['USER_MEDIA'],
      url: 'chrome-extension://test/offscreen.html',
    } satisfies chrome.offscreen.CreateParameters;
    installChromeStub(chromeStub);

    await browserOffscreen.createDocument(createParameters);

    expect(chromeStub.offscreen.createDocument).toHaveBeenCalledWith(createParameters);
  });

  it('delegates offscreen document closure to the shared adapter', async () => {
    const chromeStub = createChromeStub();
    installChromeStub(chromeStub);

    await browserOffscreen.closeDocument();

    expect(chromeStub.offscreen.closeDocument).toHaveBeenCalledOnce();
  });

  it('normalizes tab-capture media stream id acquisition and feature probing', async () => {
    const chromeStub = createChromeStub();
    chromeStub.tabCapture.getMediaStreamId.mockImplementation(
      (_options: unknown, callback: (streamId: string) => void) => callback('stream-id')
    );
    installChromeStub(chromeStub);

    expect(browserTabCapture.isMediaStreamIdSupported()).toBe(true);
    await expect(browserTabCapture.getMediaStreamId({ targetTabId: 1 })).resolves.toBe('stream-id');
  });
});
