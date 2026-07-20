import { beforeEach, expect, it, vi } from 'vitest';

const loggerErrorMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    error: loggerErrorMock,
  }),
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  toast: {
    error: toastErrorMock,
  },
}));

import {
  fireAndReportEditorAction,
  reportEditorActionFailure,
  runAndReportEditorAction,
} from './async-actions';

beforeEach(() => {
  vi.clearAllMocks();
});

it('logs and surfaces explicit error messages', () => {
  const message = reportEditorActionFailure('save-image', new Error('write failed'), {
    attempt: 1,
  });

  expect(loggerErrorMock).toHaveBeenCalledWith('save-image failed', expect.any(Error), {
    attempt: 1,
  });
  expect(toastErrorMock).toHaveBeenCalledWith('write failed');
  expect(message).toBe('write failed');
});

it('can report an inline failure without showing a toast', () => {
  const message = reportEditorActionFailure('command-palette:copy', new Error('clipboard'), {
    notify: false,
  });

  expect(loggerErrorMock).toHaveBeenCalledWith(
    'command-palette:copy failed',
    expect.any(Error),
    undefined
  );
  expect(toastErrorMock).not.toHaveBeenCalled();
  expect(message).toBe('clipboard');
});

it('falls back to the shared error label and catches detached async actions', async () => {
  fireAndReportEditorAction('async-failure', async () => {
    throw new Error('');
  });

  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(loggerErrorMock).toHaveBeenCalledWith(
    'async-failure failed',
    expect.any(Error),
    undefined
  );
  expect(toastErrorMock).toHaveBeenCalledWith('common.states.error');
});

it('awaits action completion before resolving feedback-capable actions', async () => {
  const action = vi.fn(async () => undefined);

  await runAndReportEditorAction('copy-feedback', action);

  expect(action).toHaveBeenCalledOnce();
  expect(toastErrorMock).not.toHaveBeenCalled();
});
