import { expect, it, vi } from 'vitest';

const loaderMocks = vi.hoisted(() => ({
  createLoggerErrorMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    error: loaderMocks.createLoggerErrorMock,
  }),
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  toast: {
    error: loaderMocks.toastErrorMock,
    success: vi.fn(),
  },
}));

vi.mock('../../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

import { reportAiProvidersLoaderError } from './error-handling';

it('logs and surfaces loader errors through the translated toast', () => {
  const error = new Error('storage failed');

  reportAiProvidersLoaderError(error);

  expect(loaderMocks.createLoggerErrorMock).toHaveBeenCalledWith(
    'Failed to load AI providers section data',
    error
  );
  expect(loaderMocks.toastErrorMock).toHaveBeenCalledWith(
    'common.states.errorsettings.aiProviders.loadErrorSuffix'
  );
});
