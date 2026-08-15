import type { PopupRuntimeActionHandlers } from './action-handlers';
import type { PopupRuntimeRecordingControls } from './recording-controls';

export type PopupRuntimeRecordingState = PopupRuntimeRecordingControls & PopupRuntimeActionHandlers;
