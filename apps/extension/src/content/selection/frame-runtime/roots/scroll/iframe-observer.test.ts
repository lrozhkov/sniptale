// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const iframeMocks = vi.hoisted(() => ({
  isIframeAccessible: vi.fn(),
}));

vi.mock('../../../../platform/frame', () => ({
  isIframeAccessible: iframeMocks.isIframeAccessible,
}));

import { observeIframeInsertions } from './iframe-observer';

async function flushMutationObserver() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('frame-scroll-sync-iframe-observer', () => {
  beforeEach(() => {
    iframeMocks.isIframeAccessible.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('observes top-level iframe insertions and skips extension-owned overlay containers', async () => {
    const addIframeListeners = vi.fn();
    const observer = observeIframeInsertions(addIframeListeners);
    const plainIframe = document.createElement('iframe');
    const skippedWrapper = document.createElement('div');
    const skippedIframe = document.createElement('iframe');
    skippedWrapper.className = 'sniptale-app';
    skippedWrapper.appendChild(skippedIframe);
    iframeMocks.isIframeAccessible.mockImplementation(
      (iframeEl: HTMLIFrameElement) => iframeEl === plainIframe || iframeEl === skippedIframe
    );

    document.body.appendChild(plainIframe);
    document.body.appendChild(skippedWrapper);
    await flushMutationObserver();

    expect(addIframeListeners).toHaveBeenCalledTimes(1);
    expect(addIframeListeners).toHaveBeenCalledWith(plainIframe);

    observer.disconnect();
  });

  it('registers nested iframe descendants added inside a new subtree', async () => {
    const addIframeListeners = vi.fn();
    const observer = observeIframeInsertions(addIframeListeners);
    const wrapper = document.createElement('div');
    const nested = document.createElement('section');
    const iframe = document.createElement('iframe');
    nested.appendChild(iframe);
    wrapper.appendChild(nested);
    iframeMocks.isIframeAccessible.mockReturnValue(true);

    document.body.appendChild(wrapper);
    await flushMutationObserver();

    expect(addIframeListeners).toHaveBeenCalledWith(iframe);
    observer.disconnect();
  });
});
