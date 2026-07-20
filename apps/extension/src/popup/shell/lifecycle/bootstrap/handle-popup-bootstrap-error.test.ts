import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  errorMock: vi.fn(),
  translateMock: vi.fn((key: string) => `translated:${key}`),
}));

vi.mock('../../../../platform/i18n', () => ({
  translate: mocks.translateMock,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    error: mocks.errorMock,
  }),
}));

import { handlePopupBootstrapError } from './handle-popup-bootstrap-error';

beforeEach(() => {
  mocks.errorMock.mockReset();
  mocks.translateMock.mockClear();
});

it('surfaces the bootstrap error when popup setup was not cancelled', () => {
  const setStartError = vi.fn();
  const setIsReady = vi.fn();

  handlePopupBootstrapError(new Error('boom'), () => false, setStartError, setIsReady);

  expect(mocks.errorMock).toHaveBeenCalledWith('Failed to bootstrap popup', expect.any(Error));
  expect(setStartError).toHaveBeenCalledWith('translated:popup.video.loadingPopupError');
  expect(setIsReady).toHaveBeenCalledWith(true);
});

it('returns early when popup bootstrap was cancelled', () => {
  const setStartError = vi.fn();
  const setIsReady = vi.fn();

  handlePopupBootstrapError(new Error('boom'), () => true, setStartError, setIsReady);

  expect(mocks.errorMock).toHaveBeenCalledWith('Failed to bootstrap popup', expect.any(Error));
  expect(setStartError).not.toHaveBeenCalled();
  expect(setIsReady).not.toHaveBeenCalled();
});
