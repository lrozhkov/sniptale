import { describe, expect, it } from 'vitest';
import { createUserFacingErrorMessage } from './user-facing-error';

describe('user-facing error messages', () => {
  it('keeps raw exceptions out of Russian and English UI copy', () => {
    const rawError = new Error('PAGE_READINESS: chrome-extension://secret/path');

    const english = createUserFacingErrorMessage({
      detail: 'unexpected',
      cause: rawError,
      locale: 'en',
      summaryKey: 'popup.home.openPrepError',
    });
    const russian = createUserFacingErrorMessage({
      detail: 'unexpected',
      cause: rawError,
      locale: 'ru',
      summaryKey: 'popup.home.openPrepError',
    });

    expect(english).toBe(
      'Failed to open preparation mode. Sniptale encountered an unexpected internal error. Try again; if the problem continues, reload the page.'
    );
    expect(russian).toBe(
      'Не удалось открыть режим подготовки. В Sniptale произошла непредвиденная внутренняя ошибка. Повторите попытку; если проблема сохраняется, перезагрузите страницу.'
    );
    expect(english).not.toContain(rawError.message);
    expect(russian).not.toContain(rawError.message);
  });

  it('describes the safe failure category instead of the technical exception', () => {
    expect(
      createUserFacingErrorMessage({
        detail: 'storage',
        cause: new Error('QuotaExceededError at indexed-db://private'),
        locale: 'en',
        summaryKey: 'scenario.editor.v3OperationFailed',
      })
    ).toBe(
      'Scenario editor operation failed. Sniptale could not read or save the required browser data. Check available storage and try again.'
    );
  });
});
