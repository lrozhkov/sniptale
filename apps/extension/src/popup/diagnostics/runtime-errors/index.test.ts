import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => `t:${key}`,
}));

import {
  getPopupResponseErrorMessage,
  getPopupRuntimeErrorMessage,
  isStalePageRuntimeErrorMessage,
} from './index';

describe('popup runtime errors', () => {
  it('detects stale page runtime transport errors', () => {
    expect(
      isStalePageRuntimeErrorMessage(
        'Could not establish connection. Receiving end does not exist.'
      )
    ).toBe(true);
    expect(
      isStalePageRuntimeErrorMessage('The message port closed before a response was received.')
    ).toBe(true);
    expect(isStalePageRuntimeErrorMessage('Different error')).toBe(false);
  });

  it('normalizes stale runtime errors and falls back for unknown values', () => {
    expect(getPopupRuntimeErrorMessage(new Error('boom'), 'popup.home.openPrepError')).toBe('boom');
    expect(
      getPopupRuntimeErrorMessage(
        'Could not establish connection. Receiving end does not exist.',
        'popup.home.openPrepError'
      )
    ).toBe('t:popup.common.stalePageRuntimeHint');
    expect(getPopupRuntimeErrorMessage(null, 'popup.home.openPrepError')).toBe(
      't:popup.home.openPrepError'
    );
  });

  it('reads response errors before falling back to the translation key', () => {
    expect(
      getPopupResponseErrorMessage(
        {
          error: 'Could not establish connection. Receiving end does not exist.',
          success: false,
        },
        'popup.video.startRecordingError'
      )
    ).toBe('t:popup.common.stalePageRuntimeHint');
    expect(
      getPopupResponseErrorMessage({ success: false }, 'popup.video.startRecordingError')
    ).toBe('t:popup.video.startRecordingError');
  });
});
