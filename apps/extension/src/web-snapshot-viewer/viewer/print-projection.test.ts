// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { freezeSnapshotMediaQueries, printWebSnapshotProjection } from './print-projection';

beforeEach(() => {
  document.head.replaceChildren();
  document.body.replaceChildren();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('freezes screen media branches for the captured viewport and removes print branches', () => {
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
  expect(frozenCss).not.toContain('.print-only');
  expect(frozenCss).not.toContain('@media');
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
  const print = vi.fn();
  Object.defineProperties(frameWindow, {
    focus: { configurable: true, value: vi.fn() },
    matchMedia: { configurable: true, value: () => ({ matches: false }) },
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

  expect(frame.getAttribute('sandbox')).toBe('allow-same-origin allow-modals');
  expect(frame.getAttribute('srcdoc')).toContain("default-src 'none'");
  expect(frame.style.width).toBe('1440px');
  expect(frame.style.height).toBe('900px');
  expect(image?.loading).toBe('eager');
  expect(decode).toHaveBeenCalledOnce();
  expect(print).toHaveBeenCalledOnce();
  expect(document.querySelector('iframe')).toBeNull();
});
