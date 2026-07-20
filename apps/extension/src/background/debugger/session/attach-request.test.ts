import { beforeEach, expect, it, vi } from 'vitest';
import { DEBUGGER_TIMEOUT_MS } from '../constants';
import { attachToPageTarget } from './attach-request';

const { browserDebuggerMock, keepServiceWorkerAliveMock, loggerErrorMock, stopKeepAliveMock } =
  vi.hoisted(() => ({
    browserDebuggerMock: {
      attach: vi.fn(),
      detach: vi.fn(),
    },
    keepServiceWorkerAliveMock: vi.fn(),
    loggerErrorMock: vi.fn(),
    stopKeepAliveMock: vi.fn(),
  }));

vi.mock('@sniptale/platform/browser/debugger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/debugger')>()),
  browserDebugger: browserDebuggerMock,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: loggerErrorMock,
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('../infra', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infra')>()),
  keepServiceWorkerAlive: keepServiceWorkerAliveMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  browserDebuggerMock.attach.mockResolvedValue(undefined);
  browserDebuggerMock.detach.mockResolvedValue(undefined);
  keepServiceWorkerAliveMock.mockReturnValue(stopKeepAliveMock);
});

it('attaches to a page target and releases keepalive resources on success', async () => {
  await expect(attachToPageTarget('target-7')).resolves.toBeUndefined();

  expect(browserDebuggerMock.attach).toHaveBeenCalledWith({ targetId: 'target-7' }, '1.3');
  expect(stopKeepAliveMock).toHaveBeenCalledOnce();
});

it('fails attach requests that throw synchronously', async () => {
  browserDebuggerMock.attach.mockImplementation(() => {
    throw new Error('sync attach failed');
  });

  await expect(attachToPageTarget('target-7')).rejects.toThrow('sync attach failed');
  expect(stopKeepAliveMock).toHaveBeenCalledOnce();
  expect(loggerErrorMock).toHaveBeenCalledWith('Debugger attach error', expect.any(Error));
});

it('fails attach requests that reject asynchronously', async () => {
  browserDebuggerMock.attach.mockRejectedValue(new Error('async attach failed'));

  await expect(attachToPageTarget('target-7')).rejects.toThrow('async attach failed');
  expect(stopKeepAliveMock).toHaveBeenCalledOnce();
  expect(loggerErrorMock).toHaveBeenCalledWith('Debugger attach error', expect.any(Error));
});

it('times out pending attach requests and ignores late rejections', async () => {
  vi.useFakeTimers();
  let rejectAttach: ((reason?: unknown) => void) | undefined;

  browserDebuggerMock.attach.mockReturnValue(
    new Promise<void>((_resolve, reject) => {
      rejectAttach = reject;
    })
  );

  const attachResult = attachToPageTarget('target-7').then(
    () => ({ message: 'resolved' }),
    (error: Error) => error
  );
  await vi.advanceTimersByTimeAsync(DEBUGGER_TIMEOUT_MS);

  await expect(attachResult).resolves.toMatchObject({
    message: `Timeout (${DEBUGGER_TIMEOUT_MS}ms) during debugger.attach`,
  });
  expect(stopKeepAliveMock).toHaveBeenCalledOnce();
  expect(loggerErrorMock).toHaveBeenCalledWith('Debugger attach timed out', {
    timeoutMs: DEBUGGER_TIMEOUT_MS,
  });

  rejectAttach?.(new Error('late attach failed'));
  await Promise.resolve();

  expect(stopKeepAliveMock).toHaveBeenCalledOnce();
  vi.useRealTimers();
});

it('detaches late success callbacks after an attach timeout', async () => {
  vi.useFakeTimers();
  let resolveAttach: (() => void) | undefined;

  browserDebuggerMock.attach.mockReturnValue(
    new Promise<void>((resolve) => {
      resolveAttach = resolve;
    })
  );

  const attachResult = attachToPageTarget('target-7').then(
    () => ({ message: 'resolved' }),
    (error: Error) => error
  );
  await vi.advanceTimersByTimeAsync(DEBUGGER_TIMEOUT_MS);

  await expect(attachResult).resolves.toMatchObject({
    message: `Timeout (${DEBUGGER_TIMEOUT_MS}ms) during debugger.attach`,
  });

  resolveAttach?.();
  await vi.advanceTimersByTimeAsync(0);
  await Promise.resolve();

  expect(browserDebuggerMock.detach).toHaveBeenCalledWith({ targetId: 'target-7' });
  expect(stopKeepAliveMock).toHaveBeenCalledOnce();
  vi.useRealTimers();
});
