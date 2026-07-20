import type { PopupRuntimeStateSlice } from '../state';
import type { PopupPageAccessRuntime } from '../page-access';
import type { PopupRuntimeActionHandlers } from '../types/action-handlers';
import type { PopupRuntimeState } from '../types/state';
import { assemblePopupRecordingState } from './recording';
import { assemblePopupViewState } from './view';

export function assemblePopupRuntimeState(
  state: PopupRuntimeStateSlice,
  handlers: PopupRuntimeActionHandlers,
  pageAccess: PopupPageAccessRuntime
): PopupRuntimeState {
  return {
    ...assemblePopupViewState(state, pageAccess),
    recording: assemblePopupRecordingState(state, handlers),
  };
}
