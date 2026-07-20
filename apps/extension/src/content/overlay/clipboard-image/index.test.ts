// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { copyImageToClipboard } from '.';

const translateMock = vi.hoisted(() => vi.fn((key: string) => key));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: translateMock,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    log: vi.fn(),
  }),
}));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  translateMock.mockClear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      blob: async () => new Blob(['image-bytes'], { type: 'image/jpeg' }),
    }))
  );
  vi.stubGlobal('ClipboardItem', class ClipboardItemMock {});
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      write: vi.fn(async () => undefined),
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('closes temporary image bitmaps after normalizing clipboard writes to png', async () => {
  const close = vi.fn();
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({
      close,
      height: 40,
      width: 80,
    }))
  );
  const toBlob = vi.fn((callback: BlobCallback) => {
    callback(new Blob(['png'], { type: 'image/png' }));
  });
  const getContext = vi.fn(() => ({
    drawImage: vi.fn(),
  }));
  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    const element = document.createElementNS('http://www.w3.org/1999/xhtml', tagName);
    if (tagName === 'canvas') {
      Object.assign(element, { getContext, toBlob });
    }
    return element as HTMLElement;
  });

  await expect(copyImageToClipboard('data:image/jpeg;base64,Zm9v')).resolves.toBeUndefined();

  expect(close).toHaveBeenCalledOnce();
});

it('fails without touching the clipboard when the page never regains focus', async () => {
  vi.useFakeTimers();
  vi.spyOn(document, 'hasFocus').mockReturnValue(false);

  const copyPromise = copyImageToClipboard('data:image/png;base64,Zm9v');
  const copyResult = expect(copyPromise).rejects.toThrow('content.runtime.copyImageFailed');

  await vi.advanceTimersByTimeAsync(3000);
  await copyResult;

  expect(globalThis.fetch).not.toHaveBeenCalled();
  expect(navigator.clipboard.write).not.toHaveBeenCalled();
});

it('rethrows stale capture cancellation after focus wait without touching the image payload', async () => {
  vi.useFakeTimers();
  const staleError = new Error('stale screenshot run');
  staleError.name = 'StaleScreenshotRunError';
  let focused = false;
  vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);

  const copyPromise = copyImageToClipboard('data:image/png;base64,Zm9v', {
    assertFresh: () => {
      throw staleError;
    },
    shouldRethrowError: (error) => error === staleError,
  });
  const copyResult = expect(copyPromise).rejects.toBe(staleError);

  focused = true;
  window.dispatchEvent(new Event('focus'));
  await vi.advanceTimersByTimeAsync(80);
  await copyResult;

  expect(globalThis.fetch).not.toHaveBeenCalled();
  expect(navigator.clipboard.write).not.toHaveBeenCalled();
});
