import { translate } from '../../../platform/i18n/index';

type CaptureGuardState = { isCapturing: boolean };

export function runGuardedCapture<T>(
  captureGuardState: CaptureGuardState,
  work: () => Promise<T>
): Promise<T> {
  if (captureGuardState.isCapturing) {
    return Promise.reject(new Error(translate('background.runtime.captureAlreadyRunning')));
  }

  captureGuardState.isCapturing = true;

  return work().finally(() => {
    captureGuardState.isCapturing = false;
  });
}
