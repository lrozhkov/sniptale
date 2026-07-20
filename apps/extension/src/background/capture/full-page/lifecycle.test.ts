import { beforeEach, expect, it, vi } from 'vitest';

const { detachDebuggerMock, loggerWarnMock, restoreFixedElementsMock, scrollPageMock } = vi.hoisted(
  () => ({
    detachDebuggerMock: vi.fn(),
    loggerWarnMock: vi.fn(),
    restoreFixedElementsMock: vi.fn(),
    scrollPageMock: vi.fn(),
  })
);

vi.mock('@sniptale/foundation/utils/delay', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/foundation/utils/delay')>()),
  delay: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/debugger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/debugger')>()),
  browserDebugger: {
    getTargets: vi.fn(),
    sendCommand: vi.fn(),
  },
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    debug: vi.fn(),
    warn: loggerWarnMock,
  }),
}));

vi.mock('../../debugger/session/attach', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../debugger/session/attach')>()),
  attachDebugger: vi.fn(),
}));

vi.mock('../../debugger/session/detach', () => ({
  detachDebugger: detachDebuggerMock,
}));

vi.mock('../page-state/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../page-state/index')>()),
  hideFixedElements: vi.fn(),
  restoreFixedElements: restoreFixedElementsMock,
  scrollPage: scrollPageMock,
}));

import { cleanupCapture } from './lifecycle';

beforeEach(() => {
  vi.clearAllMocks();
  detachDebuggerMock.mockResolvedValue(undefined);
  restoreFixedElementsMock.mockResolvedValue(undefined);
  scrollPageMock.mockResolvedValue(undefined);
});

it('continues restoration work when debugger detach fails during cleanup', async () => {
  const detachError = new Error('detach failed');
  detachDebuggerMock.mockRejectedValueOnce(detachError);

  await cleanupCapture(21);

  expect(restoreFixedElementsMock).toHaveBeenCalledWith(21);
  expect(scrollPageMock).toHaveBeenCalledWith(21, 0);
  expect(loggerWarnMock).toHaveBeenCalledWith(
    'Failed to detach debugger during full-page capture cleanup',
    detachError
  );
});
