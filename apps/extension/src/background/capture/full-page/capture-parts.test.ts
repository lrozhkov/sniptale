import { beforeEach, expect, it, vi } from 'vitest';

const {
  browserDebuggerSendCommandMock,
  createCapturePartMock,
  delayMock,
  getTotalCapturePartsMock,
  loggerDebugMock,
  parseCaptureScreenshotResultMock,
  scrollPageMock,
} = vi.hoisted(() => ({
  browserDebuggerSendCommandMock: vi.fn(),
  createCapturePartMock: vi.fn(),
  delayMock: vi.fn(),
  getTotalCapturePartsMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  parseCaptureScreenshotResultMock: vi.fn(),
  scrollPageMock: vi.fn(),
}));

vi.mock('@sniptale/foundation/utils/delay', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/foundation/utils/delay')>()),
  delay: delayMock,
}));

vi.mock('@sniptale/platform/browser/debugger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/debugger')>()),
  browserDebugger: {
    sendCommand: browserDebuggerSendCommandMock,
  },
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    debug: loggerDebugMock,
  }),
}));

vi.mock('./helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./helpers')>()),
  createCapturePart: createCapturePartMock,
  getTotalCaptureParts: getTotalCapturePartsMock,
  parseCaptureScreenshotResult: parseCaptureScreenshotResultMock,
}));

vi.mock('../page-state/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../page-state/index')>()),
  scrollPage: scrollPageMock,
}));

import { captureViewportParts } from './capture-parts';

beforeEach(() => {
  vi.clearAllMocks();
  delayMock.mockResolvedValue(undefined);
});

it('captures viewport parts without reporting progress when no callback is provided', async () => {
  getTotalCapturePartsMock.mockReturnValue(2);
  browserDebuggerSendCommandMock
    .mockResolvedValueOnce({ data: 'raw-1' })
    .mockResolvedValueOnce({ data: 'raw-2' });
  parseCaptureScreenshotResultMock
    .mockReturnValueOnce({ data: 'shot-1' })
    .mockReturnValueOnce({ data: 'shot-2' });
  createCapturePartMock
    .mockReturnValueOnce({ captureHeight: 500, dataUrl: 'one', offsetY: 0 })
    .mockReturnValueOnce({ captureHeight: 400, dataUrl: 'two', offsetY: 500 });

  await expect(
    captureViewportParts(41, {
      devicePixelRatio: 2,
      scrollHeight: 900,
      viewportHeight: 500,
    })
  ).resolves.toEqual([
    { captureHeight: 500, dataUrl: 'one', offsetY: 0 },
    { captureHeight: 400, dataUrl: 'two', offsetY: 500 },
  ]);

  expect(scrollPageMock).toHaveBeenNthCalledWith(1, 41, 0);
  expect(scrollPageMock).toHaveBeenNthCalledWith(2, 41, 500);
  expect(browserDebuggerSendCommandMock).toHaveBeenCalledTimes(2);
  expect(loggerDebugMock).toHaveBeenCalledWith('Capturing viewport parts', {
    devicePixelRatio: 2,
    scrollHeight: 900,
    totalParts: 2,
    viewportHeight: 500,
  });
});
