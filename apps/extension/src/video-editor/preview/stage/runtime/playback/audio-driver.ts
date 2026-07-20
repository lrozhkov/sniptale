import type { Logger } from '@sniptale/platform/observability/logger/types';
import type { PreviewAudioGraphState } from './audio-graph';

function warnPreviewAudioDriver(
  state: PreviewAudioGraphState,
  logger: Logger | null,
  message: string,
  error?: unknown
): void {
  if (state.warned) {
    return;
  }

  state.warned = true;
  logger?.warn(message, error);
}

function markPreviewAudioDriverUnavailable(
  state: PreviewAudioGraphState,
  logger: Logger | null,
  message: string,
  error?: unknown
): void {
  state.unavailable = true;
  warnPreviewAudioDriver(state, logger, message, error);
}

function resumePreviewAudioGraph(
  state: PreviewAudioGraphState,
  logger: Logger | null = null
): Promise<boolean> {
  const audioContext = state.audioContext;
  if (!audioContext || state.unavailable) {
    return Promise.resolve(false);
  }

  if (audioContext.state === 'running') {
    return Promise.resolve(true);
  }

  if (audioContext.state === 'closed') {
    state.unavailable = true;
    return Promise.resolve(false);
  }

  state.resumePromise ??= audioContext
    .resume()
    .then(() => audioContext.state === 'running')
    .catch((error) => {
      markPreviewAudioDriverUnavailable(
        state,
        logger,
        'Failed to resume preview AudioContext',
        error
      );
      return false;
    })
    .finally(() => {
      state.resumePromise = null;
    });

  return state.resumePromise;
}

function bumpPreviewAudioPlayVersion(state: PreviewAudioGraphState, clipId: string): number {
  const nextVersion = (state.playRequestVersions.get(clipId) ?? 0) + 1;
  state.playRequestVersions.set(clipId, nextVersion);
  return nextVersion;
}

export function pausePreviewAudioDriver(
  state: PreviewAudioGraphState,
  clipId: string,
  element: HTMLAudioElement
): void {
  bumpPreviewAudioPlayVersion(state, clipId);
  state.pendingPlayClipIds.delete(clipId);
  if (!element.paused) {
    element.pause();
  }
}

export function requestPreviewAudioDriverPlayback(
  state: PreviewAudioGraphState,
  clipId: string,
  element: HTMLAudioElement,
  logger: Logger | null = null
): void {
  if (state.pendingPlayClipIds.has(clipId) || !element.paused) {
    return;
  }

  const requestVersion = bumpPreviewAudioPlayVersion(state, clipId);
  state.pendingPlayClipIds.add(clipId);
  void resumePreviewAudioGraph(state, logger)
    .then((isRunning) => {
      if (requestVersion !== state.playRequestVersions.get(clipId) || !isRunning) {
        pausePreviewAudioDriver(state, clipId, element);
        return;
      }

      return element.play();
    })
    .catch((error) => {
      warnPreviewAudioDriver(state, logger, 'Preview audio driver play() rejected', error);
    })
    .finally(() => {
      state.pendingPlayClipIds.delete(clipId);
    });
}
