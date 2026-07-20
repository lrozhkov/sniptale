import { expect, it, vi } from 'vitest';

const isAbortLikeErrorMock = vi.hoisted(() => vi.fn());

vi.mock('../codecs', () => ({
  isAbortLikeError: isAbortLikeErrorMock,
}));

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

import { normalizeMp4ExportError } from './normalize-error';

it('maps abort-like and cancelled failures to the cancelled sentinel', () => {
  isAbortLikeErrorMock.mockReturnValue(true);
  expect(normalizeMp4ExportError(new Error('abort'), false)).toEqual({
    kind: 'cancelled',
    error: new Error('PROJECT_EXPORT_CANCELLED'),
  });

  isAbortLikeErrorMock.mockReturnValue(false);
  expect(normalizeMp4ExportError(new Error('cancelled'), true)).toEqual({
    kind: 'cancelled',
    error: new Error('PROJECT_EXPORT_CANCELLED'),
  });
});

it('wraps other failures with the translated prepare error prefix', () => {
  isAbortLikeErrorMock.mockReturnValue(false);

  expect(normalizeMp4ExportError(new Error('boom'), false)).toEqual({
    kind: 'failure',
    error: new Error('offscreenExport.mp4PrepareFailedPrefix boom'),
  });
});
