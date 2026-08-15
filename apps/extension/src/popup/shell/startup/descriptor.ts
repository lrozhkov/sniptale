import type { ScreenshotSetupMode } from '../../../composition/persistence/capture-settings';
import type {
  CaptureMode,
  VideoPostRecordResult,
  VideoRecordingRuntimeState,
} from '@sniptale/runtime-contracts/video/types/types';
import type { RecordingControlCapability } from '../runtime/recording-control-capability';

export type PopupRecordingSnapshot = {
  controlCapability: RecordingControlCapability | null;
  state: VideoRecordingRuntimeState;
  statusError: string | null;
};

export type PopupPostRecordSnapshot = {
  result: VideoPostRecordResult | null;
};

export type PopupStartupDescriptor =
  | { page: 'screenshots'; screenshotMode?: ScreenshotSetupMode }
  | { page: 'menu' }
  | { page: 'tools' }
  | {
      page: 'video';
      videoMode?: CaptureMode;
      recordingSnapshot?: PopupRecordingSnapshot;
      postRecordSnapshot?: PopupPostRecordSnapshot;
      recordingSeed?: VideoRecordingRuntimeState;
      recordingStartFailed?: true;
      startError?: string;
    }
  | { page: 'export'; launchSelection?: { includeAnnotations: true } };
