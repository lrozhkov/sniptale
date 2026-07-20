// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function importPopupPerformanceModule() {
  vi.resetModules();
  return import('./index');
}

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('popup-performance spans', () => {
  it(
    'stays disabled without the opt-in flag and still resolves tracked tasks',
    verifyDisabledSpans
  );

  it('logs rounded success and failure payloads when the flag is enabled', verifyRoundedSpanLogs);
});

async function verifyDisabledSpans(): Promise<void> {
  const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
  const module = await importPopupPerformanceModule();

  expect(module.startPopupPerfSpan('popup.test')).toBeNull();
  await expect(
    module.trackPopupPerfAsync('popup.task', async () => 'done', { source: 'test' })
  ).resolves.toBe('done');

  expect(debugSpy).not.toHaveBeenCalled();
}

async function verifyRoundedSpanLogs(): Promise<void> {
  window.localStorage.setItem('sniptale.popup.perf', '1');
  const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
  const nowSpy = vi.spyOn(performance, 'now');
  nowSpy
    .mockReturnValueOnce(10)
    .mockReturnValueOnce(37.44)
    .mockReturnValueOnce(50)
    .mockReturnValueOnce(83.39);

  const module = await importPopupPerformanceModule();
  module.startPopupPerfSpan('popup.bootstrap')?.end({ microphoneCount: 2 });
  module.startPopupPerfSpan('popup.bootstrap')?.fail(new Error('boom'), {
    quickActionCount: 1,
  });

  expect(debugSpy).toHaveBeenNthCalledWith(1, '[PopupPerf]', {
    durationMs: 27.4,
    label: 'popup.bootstrap',
    microphoneCount: 2,
    status: 'ok',
  });
  expect(debugSpy).toHaveBeenNthCalledWith(2, '[PopupPerf]', {
    durationMs: 33.4,
    error: 'boom',
    label: 'popup.bootstrap',
    quickActionCount: 1,
    status: 'error',
  });
}

describe('popup-performance task helpers', () => {
  it('rethrows tracked task failures after logging them', verifyTrackedTaskFailure);

  it(
    'finishes on the next animation frame or immediately when RAF is missing',
    verifyNextFrameFinish
  );
});

async function verifyTrackedTaskFailure(): Promise<void> {
  window.localStorage.setItem('sniptale.popup.perf', '1');
  const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
  const nowSpy = vi.spyOn(performance, 'now');
  nowSpy.mockReturnValueOnce(100).mockReturnValueOnce(128.88);

  const module = await importPopupPerformanceModule();

  await expect(
    module.trackPopupPerfAsync(
      'popup.failure',
      async () => {
        throw new Error('failed task');
      },
      { step: 'hydrate' }
    )
  ).rejects.toThrow('failed task');

  expect(debugSpy).toHaveBeenCalledWith('[PopupPerf]', {
    durationMs: 28.9,
    error: 'failed task',
    label: 'popup.failure',
    status: 'error',
    step: 'hydrate',
  });
}

async function verifyNextFrameFinish(): Promise<void> {
  const end = vi.fn();
  const module = await importPopupPerformanceModule();
  const requestAnimationFrameMock = vi
    .spyOn(window, 'requestAnimationFrame')
    .mockImplementation((callback: FrameRequestCallback) => {
      callback(16);
      return 1;
    });

  module.finishPopupPerfSpanOnNextFrame({ end, fail: vi.fn() }, { phase: 'raf' });
  expect(end).toHaveBeenNthCalledWith(1, { phase: 'raf' });
  expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1);

  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    value: undefined,
  });

  module.finishPopupPerfSpanOnNextFrame({ end, fail: vi.fn() }, { phase: 'fallback' });
  expect(end).toHaveBeenNthCalledWith(2, { phase: 'fallback' });
}
