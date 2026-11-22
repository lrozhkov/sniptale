// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const entrypointMocks = vi.hoisted(() => ({
  initTracer: vi.fn(),
  prepareTranslations: vi.fn(),
  initializeTopLevelContentEntry: vi.fn(),
  logIframeContentScriptLoad: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/message-tracer', () => ({
  initTracer: entrypointMocks.initTracer,
}));

vi.mock('../../../platform/i18n', () => ({
  prepareTranslations: entrypointMocks.prepareTranslations,
}));

vi.mock('./bootstrap', () => ({
  initializeTopLevelContentEntry: entrypointMocks.initializeTopLevelContentEntry,
}));

vi.mock('./diagnostics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./diagnostics')>()),
  logIframeContentScriptLoad: entrypointMocks.logIframeContentScriptLoad,
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.dispatchEvent(new Event('pagehide'));
  vi.resetModules();
  entrypointMocks.prepareTranslations.mockResolvedValue(undefined);
});

it('does not patch console methods during normal top-level bootstrap', async () => {
  const originalLog = console.log;

  await import('../..');

  expect(console.log).toBe(originalLog);
  expect(entrypointMocks.initTracer).toHaveBeenCalledWith('cs');
  expect(entrypointMocks.initializeTopLevelContentEntry).toHaveBeenCalledOnce();
});

it('does not mount content until translations are ready', async () => {
  let resolve!: () => void;
  entrypointMocks.prepareTranslations.mockReturnValue(
    new Promise<void>((ready) => {
      resolve = ready;
    })
  );
  const entry = await import('../..');
  expect(entrypointMocks.prepareTranslations).toHaveBeenCalledWith('content');
  expect(entrypointMocks.initializeTopLevelContentEntry).not.toHaveBeenCalled();
  resolve();
  await entry.contentRuntimePreparation;
  expect(entrypointMocks.initializeTopLevelContentEntry).toHaveBeenCalledOnce();
});

it('preserves the current page when translation preparation fails', async () => {
  entrypointMocks.prepareTranslations.mockRejectedValue(new Error('Unavailable catalog'));
  const entry = await import('../..');
  await expect(entry.contentRuntimePreparation).rejects.toThrow('Unavailable catalog');
  expect(entrypointMocks.initializeTopLevelContentEntry).not.toHaveBeenCalled();
});

it('does not mount after pagehide or explicit pending disposal', async () => {
  let complete!: () => void;
  entrypointMocks.prepareTranslations.mockReturnValue(
    new Promise<void>((resolve) => {
      complete = resolve;
    })
  );
  const first = await import('../..');
  window.dispatchEvent(new Event('pagehide'));
  await expect(first.contentRuntimePreparation).rejects.toThrow('cancelled');
  complete();
  expect(entrypointMocks.initializeTopLevelContentEntry).not.toHaveBeenCalled();

  vi.resetModules();
  entrypointMocks.prepareTranslations.mockReturnValue(
    new Promise<void>((resolve) => {
      complete = resolve;
    })
  );
  const second = await import('../..');
  const { disposeExistingContentRuntime } = await import('./lifecycle');
  disposeExistingContentRuntime();
  await expect(second.contentRuntimePreparation).rejects.toThrow('cancelled');
  complete();
  expect(entrypointMocks.initializeTopLevelContentEntry).not.toHaveBeenCalled();
});

it('ignores a superseded injection when its catalog preparation finishes later', async () => {
  let oldComplete!: () => void;
  let newComplete!: () => void;
  entrypointMocks.prepareTranslations
    .mockReturnValueOnce(
      new Promise<void>((resolve) => {
        oldComplete = resolve;
      })
    )
    .mockReturnValueOnce(
      new Promise<void>((resolve) => {
        newComplete = resolve;
      })
    );
  const previous = await import('../..');
  vi.resetModules();
  const current = await import('../..');
  oldComplete();
  await expect(previous.contentRuntimePreparation).rejects.toThrow('cancelled');
  expect(entrypointMocks.initializeTopLevelContentEntry).not.toHaveBeenCalled();
  newComplete();
  await current.contentRuntimePreparation;
  expect(entrypointMocks.initializeTopLevelContentEntry).toHaveBeenCalledOnce();
});

it('cancels body readiness before a later body can mount the prepared runtime', async () => {
  const body = document.body;
  body.remove();
  try {
    const entry = await import('../..');
    expect(entrypointMocks.initializeTopLevelContentEntry).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('pagehide'));
    await expect(entry.contentRuntimePreparation).rejects.toThrow('cancelled');
    document.documentElement.append(body);
    await Promise.resolve();
    expect(entrypointMocks.initializeTopLevelContentEntry).not.toHaveBeenCalled();
  } finally {
    if (!document.body) document.documentElement.append(body);
  }
});

it('bounds a missing host body and cannot mount after its readiness budget expires', async () => {
  vi.useFakeTimers();
  const body = document.body;
  body.remove();
  try {
    const entry = await import('../..');
    const failed = expect(entry.contentRuntimePreparation).rejects.toThrow(
      'Content host body unavailable'
    );
    await vi.advanceTimersByTimeAsync(2000);
    await failed;
    document.documentElement.append(body);
    await vi.runOnlyPendingTimersAsync();
    expect(entrypointMocks.initializeTopLevelContentEntry).not.toHaveBeenCalled();
  } finally {
    if (!document.body) document.documentElement.append(body);
    vi.useRealTimers();
  }
});
