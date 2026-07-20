import type { PopupRuntimeHomeView } from './home';
import type { PopupRuntimeNavigationControls } from './navigation';
import type { PopupRuntimeActionHandlers } from './action-handlers';
import type { PopupRuntimeRecordingControls } from './recording-controls';
import type { PopupPageAccessRuntime } from '../page-access';
import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import type { StoragePressureLevel } from '../../../../features/media-hub/storage-capacity';

interface PopupRuntimeEnvironmentState {
  activeTabCapabilities: ActiveTabCapabilities;
  galleryStatus: { text: string; pressure: StoragePressureLevel } | null;
  pageAccess?: PopupPageAccessRuntime;
}

export interface PopupRuntimeViewState {
  navigation: PopupRuntimeNavigationControls;
  home: PopupRuntimeHomeView;
  environment: PopupRuntimeEnvironmentState;
}
export type PopupRuntimeRecordingState = PopupRuntimeRecordingControls & PopupRuntimeActionHandlers;
export interface PopupRuntimeState {
  navigation: PopupRuntimeNavigationControls;
  home: PopupRuntimeHomeView;
  environment: PopupRuntimeEnvironmentState;
  recording: PopupRuntimeRecordingState;
}
