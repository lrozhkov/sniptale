import { translate } from '../../../platform/i18n';
export { loadAudioPeaks } from './audio-peaks';

interface MediaDurationResult {
  duration: number;
  isAuthoritative: boolean;
}

function isFiniteMediaDuration(duration: number): boolean {
  return Number.isFinite(duration) && duration > 0 && duration !== Infinity;
}

function tryProbeDurationFromTail(media: HTMLMediaElement, onFallback: () => void): void {
  try {
    media.currentTime = 1e101;
  } catch {
    window.setTimeout(onFallback, 120);
  }
}

type DurationResolverHandlers = {
  handleDurationChange: () => void;
  handleError: () => void;
  handleLoadedMetadata: () => void;
  handleTimeUpdate: () => void;
};

function createDurationResolverHandlers(
  media: HTMLMediaElement,
  finish: (duration: number) => void,
  reject: (error: Error) => void
): DurationResolverHandlers {
  const finishIfFinite = () => {
    if (isFiniteMediaDuration(media.duration)) {
      finish(media.duration);
    }
  };

  return {
    handleDurationChange: finishIfFinite,
    handleTimeUpdate: finishIfFinite,
    handleLoadedMetadata: () => {
      if (isFiniteMediaDuration(media.duration)) {
        finish(media.duration);
        return;
      }

      tryProbeDurationFromTail(media, () => finish(media.duration));
    },
    handleError: () => {
      reject(new Error(translate('shared.mediaMetadata.videoDurationReadError')));
    },
  };
}

function createFiniteDurationResolver(
  media: HTMLMediaElement,
  fallbackDuration: number,
  resolve: (duration: MediaDurationResult) => void,
  reject: (error: Error) => void
): DurationResolverHandlers {
  let handlers: DurationResolverHandlers | null = null;
  const cleanup = () => {
    if (!handlers) {
      return;
    }

    media.removeEventListener('loadedmetadata', handlers.handleLoadedMetadata);
    media.removeEventListener('durationchange', handlers.handleDurationChange);
    media.removeEventListener('timeupdate', handlers.handleTimeUpdate);
    media.removeEventListener('error', handlers.handleError);
    window.clearTimeout(timeoutId);
  };
  let settled = false;
  const finish = (duration: number) => {
    if (settled) {
      return;
    }

    settled = true;
    cleanup();
    const isAuthoritative = isFiniteMediaDuration(duration);
    resolve({
      duration: isAuthoritative ? duration : fallbackDuration,
      isAuthoritative,
    });
  };

  handlers = createDurationResolverHandlers(media, finish, (error) => {
    cleanup();
    reject(error);
  });

  const timeoutId = window.setTimeout(() => {
    finish(media.duration);
  }, 4_000);

  return handlers;
}

export function resolveMediaDuration(
  media: HTMLMediaElement,
  fallbackDuration: number
): Promise<MediaDurationResult> {
  return new Promise((resolve, reject) => {
    const handlers = createFiniteDurationResolver(media, fallbackDuration, resolve, reject);

    media.addEventListener('loadedmetadata', handlers.handleLoadedMetadata);
    media.addEventListener('durationchange', handlers.handleDurationChange);
    media.addEventListener('timeupdate', handlers.handleTimeUpdate);
    media.addEventListener('error', handlers.handleError);
  });
}
