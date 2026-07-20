const EXPORT_MEDIA_READY_TIMEOUT_MS = 30_000;

interface WaitForReadyOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

function createAbortError(): Error {
  return new Error('PROJECT_EXPORT_CANCELLED');
}

function rejectIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

export function waitForMediaElementReady(
  media: HTMLMediaElement,
  options: WaitForReadyOptions = {}
): Promise<void> {
  rejectIfAborted(options.signal);

  return new Promise((resolve, reject) => {
    const readyEvent = media instanceof HTMLAudioElement ? 'loadedmetadata' : 'loadeddata';
    const isReady =
      media instanceof HTMLAudioElement
        ? media.readyState >= HTMLMediaElement.HAVE_METADATA
        : media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;

    if (isReady) {
      resolve();
      return;
    }

    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Failed to load export media resource.'));
    };
    const onAbort = () => {
      cleanup();
      reject(createAbortError());
    };
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('Timed out loading export media resource.'));
    }, options.timeoutMs ?? EXPORT_MEDIA_READY_TIMEOUT_MS);
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      media.removeEventListener(readyEvent, onLoaded);
      media.removeEventListener('error', onError);
      options.signal?.removeEventListener('abort', onAbort);
    };

    media.addEventListener(readyEvent, onLoaded, { once: true });
    media.addEventListener('error', onError, { once: true });
    options.signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function waitForImageReady(
  image: HTMLImageElement,
  options: WaitForReadyOptions = {}
): Promise<void> {
  rejectIfAborted(options.signal);

  return new Promise((resolve, reject) => {
    if (image.complete) {
      resolve();
      return;
    }

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', onAbort);
      image.onload = null;
      image.onerror = null;
    };
    const onAbort = () => {
      cleanup();
      reject(createAbortError());
    };
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('Timed out loading image asset for export.'));
    }, options.timeoutMs ?? EXPORT_MEDIA_READY_TIMEOUT_MS);

    image.onload = () => {
      cleanup();
      resolve();
    };
    image.onerror = () => {
      cleanup();
      reject(new Error('Failed to load image asset for export.'));
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });
  });
}
