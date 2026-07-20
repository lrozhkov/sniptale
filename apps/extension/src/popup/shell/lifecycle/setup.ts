import { subscribeToMediaHubEvents } from '../../../features/media-hub/events';

import { subscribeToRecordingMessages } from '../message-sync';
import { getPopupRuntimeErrorMessage } from '../../diagnostics/runtime-errors';
import { bootstrapPopupLifecycle } from './bootstrap/run';
import { createMediaHubListener } from './media-hub-listener';
import { registerPopupLifecycleBrowserListeners } from './browser-listeners';
import type { PopupLifecycleParamsGetter } from './types';

export function setupPopupLifecycle(getParams: PopupLifecycleParamsGetter): () => void {
  let cancelled = false;

  const unsubscribeMediaHub = subscribeToMediaHubEvents(createMediaHubListener(getParams));
  const browserListeners = registerPopupLifecycleBrowserListeners(getParams);
  const unsubscribeMessages = subscribeToRecordingMessages({
    onRecordingState: (state) => {
      if (cancelled) return;
      getParams().setRecordingState(state);
    },
    onRecordingStartFailed: (error) => {
      if (cancelled) return;
      const params = getParams();
      params.setStartError(getPopupRuntimeErrorMessage(error, 'popup.video.startRecordingError'));
      params.setIsStartPending(false);
    },
  });
  void bootstrapPopupLifecycle({
    cancelledRef: () => cancelled,
    getParams,
  });

  return () => {
    cancelled = true;
    unsubscribeMessages();
    unsubscribeMediaHub();
    browserListeners();
  };
}
