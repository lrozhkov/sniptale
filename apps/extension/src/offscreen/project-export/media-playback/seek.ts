import { translate } from '../../../platform/i18n';

const FRAME_SEEK_TOLERANCE_SECONDS = 1 / 240;

export async function seekMediaElement(
  element: HTMLMediaElement,
  targetTime: number,
  signal?: AbortSignal
): Promise<void> {
  if (!Number.isFinite(targetTime)) {
    return;
  }

  const clampedTime = Math.max(0, targetTime);
  if (
    Math.abs(element.currentTime - clampedTime) <= FRAME_SEEK_TOLERANCE_SECONDS &&
    !element.seeking
  ) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      element.removeEventListener('seeked', handleSeeked);
      element.removeEventListener('error', handleError);
      signal?.removeEventListener('abort', handleAbort);
    };
    const handleSeeked = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error(translate('offscreenExport.seekMediaElementError')));
    };
    const handleAbort = () => {
      cleanup();
      reject(new DOMException('The export was aborted.', 'AbortError'));
    };

    if (signal?.aborted) {
      handleAbort();
      return;
    }

    element.addEventListener('seeked', handleSeeked, { once: true });
    element.addEventListener('error', handleError, { once: true });
    signal?.addEventListener('abort', handleAbort, { once: true });
    element.currentTime = clampedTime;
  });
}
