// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  freezeSnapshotMediaQueries,
  printWebSnapshotImageProjection,
  printWebSnapshotProjection,
} from './print-projection';

beforeEach(() => {
  document.head.replaceChildren();
  document.body.replaceChildren();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('freezes screen media branches for the captured viewport and removes page-authored print CSS', () => {
  const style = document.createElement('style');
  style.textContent = [
    '.base { color: black; }',
    '@media screen and (min-width: 1000px) { .wide { display: grid; } }',
    '@media screen and (max-width: 999px) { .narrow { display: block; } }',
    '@media print { .print-only { display: block; } }',
  ].join('\n');
  document.head.append(style);
  const matchMedia = vi.fn((query: string) => ({
    matches: query.includes('min-width: 1000px'),
  }));
  vi.stubGlobal('matchMedia', matchMedia);

  freezeSnapshotMediaQueries(document, window);

  const frozenCss = document.querySelector<HTMLStyleElement>(
    '[data-sniptale-print-frozen-styles]'
  )?.textContent;
  expect(frozenCss).toContain('.base');
  expect(frozenCss).toContain('.wide');
  expect(frozenCss).not.toContain('.narrow');
  expect(frozenCss).not.toContain('@media print');
  expect(frozenCss).not.toContain('.print-only');
  expect(frozenCss).not.toContain('@media screen');
});

it('prints a disposable offline projection and removes it after the print dialog returns', async () => {
  const projection = printWebSnapshotProjection({
    documentUrl: null,
    hostDocument: document,
    html: '<!doctype html><html><head></head><body><p>Snapshot</p></body></html>',
    viewport: { deviceScaleFactor: 1, height: 900, width: 1440 },
  });
  const frame = document.querySelector<HTMLIFrameElement>('iframe');
  const frameWindow = frame?.contentWindow;
  if (!frame || !frameWindow) throw new Error('Expected print projection frame.');
  const image = frame.contentDocument?.createElement('img');
  const decode = vi.fn().mockResolvedValue(undefined);
  if (image && frame.contentDocument?.body) {
    image.loading = 'lazy';
    Object.defineProperty(image, 'decode', { configurable: true, value: decode });
    frame.contentDocument.body.append(image);
  }
  let printPolicy = '';
  const printWithPolicy = vi.fn(() => {
    printPolicy =
      frame.contentDocument?.querySelector<HTMLStyleElement>('[data-sniptale-print-policy]')
        ?.textContent ?? '';
  });
  Object.defineProperties(frameWindow, {
    focus: { configurable: true, value: vi.fn() },
    matchMedia: { configurable: true, value: () => ({ matches: false }) },
    print: { configurable: true, value: printWithPolicy },
    requestAnimationFrame: {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    },
  });
  frame.dispatchEvent(new Event('load'));

  await projection;

  expect(frame.getAttribute('sandbox')).toBe('allow-same-origin allow-modals');
  expect(frame.getAttribute('srcdoc')).toContain("default-src 'none'");
  expect(frame.style.width).toBe('1440px');
  expect(frame.style.height).toBe('900px');
  expect(image?.loading).toBe('eager');
  expect(decode).toHaveBeenCalledOnce();
  expect(printPolicy).toContain('@page{size:1440px 900px;margin:0}');
  expect(printPolicy).toContain('width:1440px!important');
  expect(printPolicy).toContain('overflow-x:hidden!important');
  expect(printWithPolicy).toHaveBeenCalledOnce();
  expect(document.querySelector('iframe')).toBeNull();
});

it('prints the original screenshot as viewport-sized slices without rasterizing it again', async () => {
  const projection = printWebSnapshotImageProjection({
    hostDocument: document,
    screenshotUrl: 'blob:snapshot-screenshot',
    viewport: { deviceScaleFactor: 1, height: 900, width: 1440 },
  });
  const frame = document.querySelector<HTMLIFrameElement>('iframe');
  const frameDocument = frame?.contentDocument;
  const frameWindow = frame?.contentWindow;
  if (!frame || !frameDocument || !frameWindow) {
    throw new Error('Expected image print projection frame.');
  }
  const frameImagePrototype = Reflect.getPrototypeOf(frameDocument.createElement('img'));
  if (!frameImagePrototype) throw new Error('Expected frame image prototype.');
  Object.defineProperties(frameImagePrototype, {
    complete: { configurable: true, get: () => true },
    decode: { configurable: true, value: vi.fn().mockResolvedValue(undefined) },
    naturalHeight: { configurable: true, get: () => 1600 },
    naturalWidth: { configurable: true, get: () => 1000 },
  });
  let printedPageOffsets: string[] = [];
  let printedPageCount = 0;
  const print = vi.fn(() => {
    const printedPages = frameDocument.querySelectorAll<HTMLElement>('.sniptale-image-page');
    printedPageCount = printedPages.length;
    printedPageOffsets = [...printedPages].map(
      (page) => page.querySelector('img')?.style.top ?? ''
    );
  });
  Object.defineProperties(frameWindow, {
    focus: { configurable: true, value: vi.fn() },
    print: { configurable: true, value: print },
    requestAnimationFrame: {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    },
  });
  frame.dispatchEvent(new Event('load'));

  await projection;

  const policy = frameDocument.querySelector<HTMLStyleElement>(
    '[data-sniptale-image-print-policy]'
  )?.textContent;
  expect(frame.getAttribute('sandbox')).toBe('allow-same-origin allow-modals');
  expect(frame.getAttribute('srcdoc')).toContain("default-src 'none'");
  expect(policy).toContain('@page{size:1000px 625px;margin:0}');
  expect(printedPageCount).toBe(3);
  expect(printedPageOffsets).toEqual(['0px', '-625px', '-1250px']);
  expect(print).toHaveBeenCalledOnce();
  expect(document.querySelector('iframe')).toBeNull();
});
