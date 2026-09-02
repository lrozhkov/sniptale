// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  expandSnapshotScrollRegions,
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

it('preserves declarations when Chromium exposes an empty nested-rule list on a style rule', () => {
  const style = document.createElement('style');
  style.textContent = '.snapshot-layout { display: flex; position: absolute; }';
  document.head.append(style);
  const rule = style.sheet?.cssRules[0];
  if (!rule) throw new Error('Expected a parsed snapshot style rule.');
  Object.defineProperty(rule, 'cssRules', { configurable: true, value: [] });

  freezeSnapshotMediaQueries(document, window);

  const frozenCss = document.querySelector<HTMLStyleElement>(
    '[data-sniptale-print-frozen-styles]'
  )?.textContent;
  expect(frozenCss).toContain('display: flex');
  expect(frozenCss).toContain('position: absolute');
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
  const authoredPrintStyle = frame.contentDocument?.createElement('style');
  if (authoredPrintStyle && frame.contentDocument?.head) {
    authoredPrintStyle.textContent =
      '@media print { .article { display: block; max-width: 42rem; } }';
    frame.contentDocument.head.append(authoredPrintStyle);
  }
  let authoredPrintCss = '';
  let printPolicy = '';
  const printWithPolicy = vi.fn(() => {
    authoredPrintCss = Array.from(frame.contentDocument?.styleSheets ?? [])
      .flatMap((sheet) => Array.from(sheet.cssRules))
      .map((rule) => rule.cssText)
      .join('\n');
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
  expect(authoredPrintCss).toContain('@media print');
  expect(authoredPrintCss).toContain('max-width: 42rem');
  expect(printPolicy).not.toContain('@page');
  expect(printPolicy).not.toContain('width:1440px!important');
  expect(printPolicy).toContain('overflow:visible!important');
  expect(printPolicy).toContain('[data-sniptale-print-scroll-region]');
  expect(printPolicy).toContain('width:100%!important');
  expect(printWithPolicy).toHaveBeenCalledOnce();
  expect(document.querySelector('iframe')).toBeNull();
});

it('expands an internal scroll region and its positioned ancestors before printing', () => {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const projectionDocument = frame.contentDocument;
  if (!projectionDocument) throw new Error('Expected projection document.');
  const host = projectionDocument.createElement('div');
  const shadow = host.attachShadow({ mode: 'open' });
  const shell = projectionDocument.createElement('main');
  shell.id = 'shell';
  shell.style.cssText = 'position:absolute;height:300px;overflow:hidden';
  const scroll = projectionDocument.createElement('section');
  scroll.id = 'scroll';
  scroll.style.cssText = 'position:absolute;inset:0;height:300px;overflow:auto';
  scroll.append(projectionDocument.createElement('p'), projectionDocument.createElement('p'));
  shell.append(scroll);
  shadow.append(shell);
  projectionDocument.body.append(host);
  Object.defineProperties(scroll, {
    clientHeight: { configurable: true, value: 300 },
    clientWidth: { configurable: true, value: 600 },
    scrollHeight: { configurable: true, value: 600 },
  });
  expect({
    clientHeight: scroll.clientHeight,
    overflow: getComputedStyle(scroll).overflow,
    overflowY: getComputedStyle(scroll).overflowY,
    scrollHeight: scroll.scrollHeight,
  }).toEqual({ clientHeight: 300, overflow: 'auto', overflowY: 'visible', scrollHeight: 600 });

  expandSnapshotScrollRegions(projectionDocument);

  expect({
    scrollHeight: scroll.style.getPropertyValue('height'),
    scrollMinHeight: scroll.style.getPropertyValue('min-height'),
    scrollOverflow: scroll.style.getPropertyValue('overflow'),
    scrollPosition: scroll.style.getPropertyValue('position'),
    scrollWidth: scroll.style.getPropertyValue('width'),
    shellHeight: shell.style.getPropertyValue('height'),
    shellPosition: shell.style.getPropertyValue('position'),
    shellWidth: shell.style.getPropertyValue('width'),
    shadowHostHeight: host.style.getPropertyValue('height'),
  }).toEqual({
    scrollHeight: '600px',
    scrollMinHeight: '600px',
    scrollOverflow: 'visible',
    scrollPosition: 'relative',
    scrollWidth: '100%',
    shellHeight: 'auto',
    shellPosition: 'relative',
    shellWidth: '100%',
    shadowHostHeight: 'auto',
  });
});

it('leaves compact dropdown scroll regions to authored print CSS', () => {
  const dropdown = document.createElement('div');
  dropdown.style.cssText = 'height:32px;width:220px;overflow:auto';
  document.body.append(dropdown);
  Object.defineProperties(dropdown, {
    clientHeight: { configurable: true, value: 32 },
    clientWidth: { configurable: true, value: 220 },
    scrollHeight: { configurable: true, value: 1000 },
  });

  expandSnapshotScrollRegions(document);

  expect(dropdown.hasAttribute('data-sniptale-print-scroll-region')).toBe(false);
  expect(dropdown.style.height).toBe('32px');
  expect(dropdown.style.overflow).toBe('auto');
});

it('prints the complete original screenshot as one scalable image without rasterizing it again', async () => {
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
  expect(policy).not.toContain('@page');
  expect(policy).toContain('aspect-ratio:1000/1600');
  expect(printedPageCount).toBe(1);
  expect(printedPageOffsets).toEqual(['0px']);
  expect(print).toHaveBeenCalledOnce();
  expect(document.querySelector('iframe')).toBeNull();
});
