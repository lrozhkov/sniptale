// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForAccessibleIframeReady } from './ready';

function ensureIframeDocument(iframe: HTMLIFrameElement): Document {
  const iframeDoc = iframe.contentDocument;
  const iframeWindow = iframe.contentWindow;
  if (!iframeDoc || !iframeWindow) {
    throw new Error('Expected iframe document');
  }

  Object.defineProperty(iframeWindow, 'frameElement', {
    configurable: true,
    value: iframe,
  });

  return iframeDoc;
}

function createIframe(): { iframe: HTMLIFrameElement; iframeDoc: Document } {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);
  const iframeDoc = ensureIframeDocument(iframe);
  return { iframe, iframeDoc };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('waitForAccessibleIframeReady ready-state handling', () => {
  it('returns immediately when accessible iframe content already exists', async () => {
    const { iframeDoc } = createIframe();
    iframeDoc.body.append(iframeDoc.createElement('div'));
    iframeDoc.body.lastElementChild?.append('Ready');

    const result = await waitForAccessibleIframeReady({ timeoutMs: 50, pollIntervalMs: 5 });

    expect(result.timedOut).toBe(false);
    expect(result.totalIframes).toBe(1);
    expect(result.pendingIframes).toHaveLength(0);
  });

  it('waits briefly for iframe body content to appear', async () => {
    const { iframeDoc } = createIframe();
    const mountRoot = iframeDoc.createElement('div');
    mountRoot.id = 'root';
    iframeDoc.body.append(mountRoot);

    window.setTimeout(() => {
      const section = iframeDoc.createElement('section');
      section.textContent = 'Loaded iframe content';
      mountRoot.append(section);
    }, 25);

    const result = await waitForAccessibleIframeReady({ timeoutMs: 150, pollIntervalMs: 5 });

    expect(result.timedOut).toBe(false);
    expect(result.pendingIframes).toHaveLength(0);
  });
});

function registerTimeoutHandlingTests() {
  it('times out when iframe remains empty', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    createIframe();

    const result = await waitForAccessibleIframeReady({
      contextLabel: 'timeout-test',
      timeoutMs: 20,
      pollIntervalMs: 5,
    });

    expect(result.timedOut).toBe(true);
    expect(result.pendingIframes).toHaveLength(1);
    expect(debugSpy).toHaveBeenCalledWith(
      '[FrameIframeDiag]',
      'waitForAccessibleIframeReady.timeout',
      expect.objectContaining({
        contextLabel: 'timeout-test',
        totalIframes: 1,
      })
    );
  });
}

function registerRecursiveReadyTests() {
  it('waits through nested accessible iframes recursively', async () => {
    const { iframeDoc } = createIframe();
    const wrapper = iframeDoc.createElement('div');
    wrapper.textContent = 'Outer iframe content';
    iframeDoc.body.append(wrapper);

    const nestedIframe = iframeDoc.createElement('iframe');
    iframeDoc.body.append(nestedIframe);
    const nestedDoc = ensureIframeDocument(nestedIframe);
    const article = nestedDoc.createElement('article');
    article.textContent = 'Nested iframe content';
    nestedDoc.body.append(article);

    const result = await waitForAccessibleIframeReady({ timeoutMs: 50, pollIntervalMs: 5 });

    expect(result.timedOut).toBe(false);
    expect(result.totalIframes).toBe(2);
    expect(result.pendingIframes).toHaveLength(0);
  });

  it('uses an injected root document instead of the top document', async () => {
    const { iframeDoc: rootDocument } = createIframe();
    const nestedIframe = rootDocument.createElement('iframe');
    rootDocument.body.append(nestedIframe);
    const nestedDoc = ensureIframeDocument(nestedIframe);
    nestedDoc.body.append('Scoped iframe content');

    const result = await waitForAccessibleIframeReady({
      rootDocument,
      timeoutMs: 50,
      pollIntervalMs: 5,
    });

    expect(result.timedOut).toBe(false);
    expect(result.totalIframes).toBe(1);
    expect(result.pendingIframes).toHaveLength(0);
  });
}

describe('waitForAccessibleIframeReady timeout and recursion handling', () => {
  registerTimeoutHandlingTests();
  registerRecursiveReadyTests();
});
