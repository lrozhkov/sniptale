import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n/popup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n/popup')>()),
  translate: (key: string) => `t:${key}`,
}));

import { getPopupRuntimeErrorMessage } from './index';

describe('localized background popup runtime errors', () => {
  it('normalizes recording timeout errors through the popup locale', () => {
    expect(
      getPopupRuntimeErrorMessage(
        'Запуск записи занял слишком много времени.',
        'popup.video.startRecordingError'
      )
    ).toBe('t:popup.video.startRecordingTimeout');
    expect(
      getPopupRuntimeErrorMessage(
        'Starting the recording took too long.',
        'popup.video.startRecordingError'
      )
    ).toBe('t:popup.video.startRecordingTimeout');
  });

  it('normalizes background page-access failures through the popup locale', () => {
    expect(
      getPopupRuntimeErrorMessage('Page access is required.', 'popup.home.triggerQuickActionError')
    ).toBe('t:popup.home.pageAccessRequired');
    expect(
      getPopupRuntimeErrorMessage('Page access is required for export.', 'popup.home.captureError')
    ).toBe('t:popup.home.pageAccessRequired');
  });
});
