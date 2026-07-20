// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useContentScreenshotAutoStart } from '.';
import type { PendingAutoStartCapture } from '../../app/content-mode/state/pending-auto-start';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const clearPendingAutoStartCapture = vi.fn();
const fallbackHandleTakeScreenshot = vi
  .fn<(type: 'visible' | 'full' | 'selection', source?: unknown) => Promise<void>>()
  .mockResolvedValue(undefined);

function Harness(props: {
  handleTakeScreenshot?: (
    type: 'visible' | 'full' | 'selection',
    source?: unknown,
    startContext?: unknown
  ) => Promise<void>;
  pendingAutoStartCapture: PendingAutoStartCapture | null;
  screenshotMode: boolean;
}) {
  useContentScreenshotAutoStart({
    clearPendingAutoStartCapture,
    handleTakeScreenshot: props.handleTakeScreenshot ?? fallbackHandleTakeScreenshot,
    pendingAutoStartCapture: props.pendingAutoStartCapture,
    screenshotMode: props.screenshotMode,
  });
  return null;
}

async function renderHarness(props: {
  handleTakeScreenshot?: (
    type: 'visible' | 'full' | 'selection',
    source?: unknown,
    startContext?: unknown
  ) => Promise<void>;
  pendingAutoStartCapture: PendingAutoStartCapture | null;
  screenshotMode: boolean;
}) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<Harness {...props} />);
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  clearPendingAutoStartCapture.mockReset();
  fallbackHandleTakeScreenshot.mockReset();
  fallbackHandleTakeScreenshot.mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('runs the queued auto-start capture only after screenshot mode becomes ready', async () => {
  await renderHarness({
    pendingAutoStartCapture: { type: 'selection' },
    screenshotMode: false,
  });

  expect(clearPendingAutoStartCapture).not.toHaveBeenCalled();
  expect(fallbackHandleTakeScreenshot).not.toHaveBeenCalled();

  await renderHarness({
    pendingAutoStartCapture: { type: 'selection' },
    screenshotMode: true,
  });

  expect(clearPendingAutoStartCapture).toHaveBeenCalledTimes(1);
  expect(fallbackHandleTakeScreenshot).toHaveBeenCalledWith('selection', undefined, undefined);
});

it('consumes the queued auto-start capture even when screenshot start fails', async () => {
  fallbackHandleTakeScreenshot.mockRejectedValueOnce(new Error('capture failed'));

  await renderHarness({
    pendingAutoStartCapture: { type: 'visible' },
    screenshotMode: true,
  });
  await act(async () => {
    await Promise.resolve();
  });

  expect(fallbackHandleTakeScreenshot).toHaveBeenCalledWith('visible', undefined, undefined);
  expect(clearPendingAutoStartCapture).toHaveBeenCalledTimes(1);
});

it('does not rerun the same queued auto-start capture across rerenders while the queue is clearing', async () => {
  const firstHandleTakeScreenshot = vi.fn().mockResolvedValue(undefined);
  const secondHandleTakeScreenshot = vi.fn().mockResolvedValue(undefined);

  await renderHarness({
    handleTakeScreenshot: firstHandleTakeScreenshot,
    pendingAutoStartCapture: { type: 'selection' },
    screenshotMode: true,
  });

  await renderHarness({
    handleTakeScreenshot: secondHandleTakeScreenshot,
    pendingAutoStartCapture: { type: 'selection' },
    screenshotMode: true,
  });

  expect(firstHandleTakeScreenshot).toHaveBeenCalledTimes(1);
  expect(firstHandleTakeScreenshot).toHaveBeenCalledWith('selection', undefined, undefined);
  expect(secondHandleTakeScreenshot).not.toHaveBeenCalled();
  expect(clearPendingAutoStartCapture).toHaveBeenCalledTimes(1);
});

it('passes the queued navigation baseline into the auto-start capture', async () => {
  await renderHarness({
    pendingAutoStartCapture: {
      startContext: { navigationLockBaseline: false },
      type: 'visible',
    },
    screenshotMode: true,
  });

  expect(fallbackHandleTakeScreenshot).toHaveBeenCalledWith('visible', undefined, {
    navigationLockBaseline: false,
  });
});

it('waits for the content document to regain focus before starting queued capture', async () => {
  vi.useFakeTimers();
  const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });

  await renderHarness({
    pendingAutoStartCapture: { type: 'visible' },
    screenshotMode: true,
  });

  expect(clearPendingAutoStartCapture).toHaveBeenCalledTimes(1);
  expect(fallbackHandleTakeScreenshot).not.toHaveBeenCalled();

  hasFocus.mockReturnValue(true);
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(100);
  });

  expect(fallbackHandleTakeScreenshot).toHaveBeenCalledWith('visible', undefined, undefined);
});

it('keeps queued capture waiting when focus drops during the settle delay', async () => {
  vi.useFakeTimers();
  const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);

  await renderHarness({
    pendingAutoStartCapture: { type: 'visible' },
    screenshotMode: true,
  });

  hasFocus.mockReturnValue(true);
  window.dispatchEvent(new Event('focus'));
  hasFocus.mockReturnValue(false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(80);
  });

  expect(fallbackHandleTakeScreenshot).not.toHaveBeenCalled();

  hasFocus.mockReturnValue(true);
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(80);
  });

  expect(fallbackHandleTakeScreenshot).toHaveBeenCalledWith('visible', undefined, undefined);
});

it('continues queued capture after the full focus timeout expires', async () => {
  vi.useFakeTimers();
  vi.spyOn(document, 'hasFocus').mockReturnValue(false);

  await renderHarness({
    pendingAutoStartCapture: { type: 'visible' },
    screenshotMode: true,
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });

  expect(fallbackHandleTakeScreenshot).toHaveBeenCalledWith('visible', undefined, undefined);
});

it('cancels queued capture when screenshot mode is disabled during focus wait', async () => {
  vi.useFakeTimers();
  const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);

  await renderHarness({
    pendingAutoStartCapture: { type: 'visible' },
    screenshotMode: true,
  });
  await renderHarness({
    pendingAutoStartCapture: null,
    screenshotMode: false,
  });

  hasFocus.mockReturnValue(true);
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(100);
  });

  expect(fallbackHandleTakeScreenshot).not.toHaveBeenCalled();
});

it('starts only the replacement queued capture after focus returns', async () => {
  vi.useFakeTimers();
  const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);

  await renderHarness({
    pendingAutoStartCapture: { type: 'visible' },
    screenshotMode: true,
  });
  await renderHarness({
    pendingAutoStartCapture: { type: 'full' },
    screenshotMode: true,
  });

  hasFocus.mockReturnValue(true);
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(100);
  });

  expect(fallbackHandleTakeScreenshot).toHaveBeenCalledTimes(1);
  expect(fallbackHandleTakeScreenshot).toHaveBeenCalledWith('full', undefined, undefined);
});

it('cancels queued capture when the auto-start owner unmounts during focus wait', async () => {
  vi.useFakeTimers();
  const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);

  await renderHarness({
    pendingAutoStartCapture: { type: 'visible' },
    screenshotMode: true,
  });
  act(() => {
    root?.unmount();
  });

  hasFocus.mockReturnValue(true);
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(100);
  });

  expect(fallbackHandleTakeScreenshot).not.toHaveBeenCalled();
});
