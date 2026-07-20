// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { isContentDocumentFocused, waitForContentDocumentFocus } from './focus';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useFakeTimers();
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('reports whether the visible content document has focus', () => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);

  expect(isContentDocumentFocused()).toBe(true);
});

it('resolves false when focus does not return before the timeout', async () => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(false);

  const focusPromise = waitForContentDocumentFocus({ settleMs: 0, timeoutMs: 100 });
  await vi.advanceTimersByTimeAsync(100);

  await expect(focusPromise).resolves.toBe(false);
});

it('resolves true after a focus event and settle delay', async () => {
  const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);

  const focusPromise = waitForContentDocumentFocus({ settleMs: 80, timeoutMs: 1000 });
  hasFocus.mockReturnValue(true);
  window.dispatchEvent(new Event('focus'));
  await vi.advanceTimersByTimeAsync(80);

  await expect(focusPromise).resolves.toBe(true);
});

it('keeps waiting when focus drops during the settle delay and returns before timeout', async () => {
  const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
  const focusPromise = waitForContentDocumentFocus({ settleMs: 80, timeoutMs: 1000 });
  const focusResult = vi.fn();
  void focusPromise.then(focusResult);

  hasFocus.mockReturnValue(true);
  window.dispatchEvent(new Event('focus'));
  hasFocus.mockReturnValue(false);
  await vi.advanceTimersByTimeAsync(80);
  await Promise.resolve();

  expect(focusResult).not.toHaveBeenCalled();

  hasFocus.mockReturnValue(true);
  window.dispatchEvent(new Event('focus'));
  await vi.advanceTimersByTimeAsync(80);

  await expect(focusPromise).resolves.toBe(true);
});
