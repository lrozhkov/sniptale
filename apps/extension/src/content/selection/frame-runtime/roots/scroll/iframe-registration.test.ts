// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const iframeMocks = vi.hoisted(() => ({
  isIframeAccessible: vi.fn(),
}));

vi.mock('../../../../platform/frame', async (importOriginal) => ({
  ...(await importOriginal()),
  isIframeAccessible: iframeMocks.isIframeAccessible,
}));

import { registerIframeScrollListeners } from './iframe-registration';

function createIframeDocument() {
  const iframeDoc = document.implementation.createHTMLDocument('iframe');
  iframeDoc.body.innerHTML = '<div>body</div>';
  return iframeDoc;
}

function attachIframeContext(iframeEl: HTMLIFrameElement, iframeDoc = createIframeDocument()) {
  const iframeWindow = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const addDocumentListener = vi.spyOn(iframeDoc, 'addEventListener');
  const removeDocumentListener = vi.spyOn(iframeDoc, 'removeEventListener');
  const scrollingElement = iframeDoc.scrollingElement;
  const addScrollingElementListener = scrollingElement
    ? vi.spyOn(scrollingElement, 'addEventListener')
    : null;

  Object.defineProperty(iframeEl, 'contentWindow', {
    configurable: true,
    get: () => iframeWindow,
  });
  Object.defineProperty(iframeEl, 'contentDocument', {
    configurable: true,
    get: () => iframeDoc,
  });

  return {
    addDocumentListener,
    addScrollingElementListener,
    iframeWindow,
    removeDocumentListener,
  };
}

beforeEach(() => {
  iframeMocks.isIframeAccessible.mockReset();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('frame-scroll-sync-iframe-registration', () => {
  it('registers iframe window/document listeners, load replay, and cleanup handlers', () => {
    const iframeEl = document.createElement('iframe');
    const debouncedHandleScroll = vi.fn();
    const {
      addDocumentListener,
      addScrollingElementListener,
      iframeWindow,
      removeDocumentListener,
    } = attachIframeContext(iframeEl);
    document.body.appendChild(iframeEl);
    iframeMocks.isIframeAccessible.mockReturnValue(true);

    const { addIframeListeners, iframeCleanups } =
      registerIframeScrollListeners(debouncedHandleScroll);

    expect(iframeWindow.addEventListener).toHaveBeenCalledWith('scroll', debouncedHandleScroll, {
      passive: true,
    });
    expect(iframeWindow.addEventListener).toHaveBeenCalledWith('resize', debouncedHandleScroll);
    expect(addDocumentListener).toHaveBeenCalledWith('scroll', debouncedHandleScroll, {
      capture: true,
      passive: true,
    });
    if (addScrollingElementListener) {
      expect(addScrollingElementListener).toHaveBeenCalledWith('scroll', debouncedHandleScroll, {
        passive: true,
      });
    }

    iframeEl.dispatchEvent(new Event('load'));

    expect(debouncedHandleScroll).toHaveBeenCalledTimes(1);

    iframeCleanups.forEach((cleanup) => cleanup());
    addIframeListeners(iframeEl);

    expect(iframeWindow.removeEventListener).toHaveBeenCalledWith('scroll', debouncedHandleScroll);
    expect(iframeWindow.removeEventListener).toHaveBeenCalledWith('resize', debouncedHandleScroll);
    expect(removeDocumentListener).toHaveBeenCalledWith('scroll', debouncedHandleScroll, {
      capture: true,
    });
  });
});
