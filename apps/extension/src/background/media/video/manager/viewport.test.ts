import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

const {
  attachDebugger,
  clearViewport,
  createLogger,
  detachDebugger,
  logger,
  resetZoom,
  setViewport,
} = vi.hoisted(() => ({
  attachDebugger: vi.fn(),
  clearViewport: vi.fn(),
  createLogger: vi.fn(() => logger),
  detachDebugger: vi.fn(),
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
  },
  resetZoom: vi.fn(),
  setViewport: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger,
}));

vi.mock('../../../debugger/session/attach', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../debugger/session/attach')>()),
  attachDebugger,
}));

vi.mock('../../../debugger/session/detach', () => ({
  detachDebugger,
}));

vi.mock('../../../debugger/workspace', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../debugger/workspace')>()),
  clearViewport,
  resetZoom,
  setViewport,
}));

import { cleanupViewportEmulation, configureViewportEmulation } from './viewport';

function resetViewportMocks(): void {
  vi.clearAllMocks();
  attachDebugger.mockResolvedValue(undefined);
  clearViewport.mockResolvedValue(undefined);
  detachDebugger.mockResolvedValue(undefined);
  resetZoom.mockResolvedValue(undefined);
  setViewport.mockResolvedValue({
    cssHeight: 900,
    cssWidth: 1600,
    scale: 1,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  resetViewportMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

it('skips debugger setup when viewport emulation is not requested', async () => {
  await expect(
    configureViewportEmulation(7, CaptureMode.TAB, {
      id: 'wide',
      label: 'Wide',
      width: 1600,
      height: 900,
    })
  ).resolves.toBeUndefined();

  expect(attachDebugger).not.toHaveBeenCalled();
  expect(resetZoom).not.toHaveBeenCalled();
  expect(setViewport).not.toHaveBeenCalled();
});

it('skips debugger setup when no viewport preset is provided', async () => {
  await expect(
    configureViewportEmulation(7, CaptureMode.VIEWPORT_EMULATION)
  ).resolves.toBeUndefined();

  expect(attachDebugger).not.toHaveBeenCalled();
});

it('attaches the debugger, waits briefly, and configures the viewport preset', async () => {
  const pending = configureViewportEmulation(9, CaptureMode.VIEWPORT_EMULATION, {
    id: 'wide',
    label: 'Wide',
    width: 1600,
    height: 900,
  });

  await vi.advanceTimersByTimeAsync(200);

  await expect(pending).resolves.toEqual({
    cssHeight: 900,
    cssWidth: 1600,
    scale: 1,
  });
  expect(attachDebugger).toHaveBeenCalledWith(
    9,
    'video-emulation',
    expect.objectContaining({ token: expect.any(String) })
  );
  expect(resetZoom).toHaveBeenCalledWith(9);
  expect(setViewport).toHaveBeenCalledWith(9, 1600, 900);
});

it('detaches the debugger before rethrowing viewport configuration failures', async () => {
  const viewportError = new Error('viewport failed');
  setViewport.mockRejectedValue(viewportError);

  const pending = configureViewportEmulation(11, CaptureMode.VIEWPORT_EMULATION, {
    id: 'tall',
    label: 'Tall',
    width: 1080,
    height: 1920,
  });
  const handledRejection = pending.then(
    () => new Error('expected viewport configuration to fail'),
    (error: unknown) => error
  );

  await vi.advanceTimersByTimeAsync(200);

  await expect(handledRejection).resolves.toBe(viewportError);
  expect(detachDebugger).toHaveBeenCalledWith(11, 'video-emulation');
});

it('logs a warning when cleanup detach fails after a viewport setup error', async () => {
  const viewportError = new Error('viewport failed');
  setViewport.mockRejectedValue(viewportError);
  detachDebugger.mockRejectedValueOnce(new Error('detach failed'));

  const pending = configureViewportEmulation(12, CaptureMode.VIEWPORT_EMULATION, {
    id: 'wide',
    label: 'Wide',
    width: 1600,
    height: 900,
  });
  const handledRejection = pending.then(
    () => new Error('expected viewport configuration to fail'),
    (error: unknown) => error
  );

  await vi.advanceTimersByTimeAsync(200);

  await expect(handledRejection).resolves.toBe(viewportError);
  expect(logger.warn).toHaveBeenCalledWith(
    'Failed to detach viewport emulation debugger after setup error',
    { tabId: 12 },
    expect.any(Error)
  );
});

it('clears viewport emulation before detaching after setup cancellation', async () => {
  await cleanupViewportEmulation(13, 'cancelled');

  expect(clearViewport).toHaveBeenCalledWith(13);
  expect(detachDebugger).toHaveBeenCalledWith(13, 'video-emulation');
});
