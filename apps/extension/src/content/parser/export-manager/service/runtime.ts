import type { TranslationKey } from '../../../../platform/i18n';
import { createUserFacingErrorMessage } from '../../../../platform/i18n/user-facing-error';

export function getExportErrorMessage(error: unknown, fallbackKey: TranslationKey): string {
  return createUserFacingErrorMessage({
    cause: error,
    detail: 'unexpected',
    summaryKey: fallbackKey,
  });
}
