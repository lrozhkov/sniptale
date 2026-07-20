import { isAbortLikeError } from '../codecs';
import { translate } from '../../../platform/i18n';

type Mp4ExportErrorNormalization =
  | {
      kind: 'cancelled';
      error: Error;
    }
  | {
      kind: 'failure';
      error: Error;
    };

export function normalizeMp4ExportError(
  error: unknown,
  cancelled: boolean
): Mp4ExportErrorNormalization {
  if (isAbortLikeError(error) || cancelled) {
    return {
      kind: 'cancelled',
      error: new Error('PROJECT_EXPORT_CANCELLED'),
    };
  }

  return {
    kind: 'failure',
    error: new Error(
      `${translate('offscreenExport.mp4PrepareFailedPrefix')} ${
        error instanceof Error ? error.message : String(error)
      }`
    ),
  };
}
