import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import type { StoragePressureLevel } from '../../../../features/media-hub/storage-capacity';
import type { ViewportPreset } from '../../../../contracts/settings';
import type { PopupPageAccessRuntime } from '../page-access';
import type { PopupRuntimeRecordingState } from './state';

export interface PopupVideoSetupRuntime {
  environment: {
    activeTabCapabilities: ActiveTabCapabilities;
    galleryStatus: { text: string; pressure: StoragePressureLevel } | null;
    pageAccess?: PopupPageAccessRuntime;
  };
  recording: PopupRuntimeRecordingState;
  viewportPresets: ViewportPreset[];
}
