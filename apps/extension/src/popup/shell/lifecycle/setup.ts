import { subscribeToMediaHubEvents } from '../../../features/media-hub/events';

import { subscribeToRecordingMessages } from '../message-sync';
import { getPopupRuntimeErrorMessage } from '../../diagnostics/runtime-errors';
import { bootstrapPopupLifecycle } from './bootstrap-workflow';
import { createMediaHubListener } from './media-hub-listener';
import { registerPopupLifecycleBrowserListeners } from './browser-listeners';
import type { PopupLifecycleParamsGetter } from './contracts';

export function setupPopupLifecycle(getParams: PopupLifecycleParamsGetter): () => void {
  let cancelled = false;

  const unsubscribeMediaHub = subscribeToMediaHubEvents(
    createMediaHubListener(() => getParams().mediaHub)
  );
  const browserListeners = registerPopupLifecycleBrowserListeners(() => getParams().browser);
  const unsubscribeMessages = subscribeToRecordingMessages({
    onRecordingState: (state) => {
      if (cancelled) return;
      getParams().recording.setRecordingState(state);
    },
    onRecordingStartFailed: (error) => {
      if (cancelled) return;
      const recording = getParams().recording;
      recording.setStartError(
        getPopupRuntimeErrorMessage(error, 'popup.video.startRecordingError')
      );
      recording.setIsStartPending(false);
    },
  });
  void bootstrapPopupLifecycle({
    cancelledRef: () => cancelled,
    getParams: () => getParams().bootstrap,
  });

  return () => {
    cancelled = true;
    unsubscribeMessages();
    unsubscribeMediaHub();
    browserListeners();
  };
}
