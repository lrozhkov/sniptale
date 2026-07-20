import type { Dispatch, SetStateAction } from 'react';
import type { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import {
  type VideoRecordingSettings,
  type VideoRecordingRuntimeState,
} from '@sniptale/runtime-contracts/video/types/types';
import type { ViewportPreset } from '../../../../contracts/settings';
import type { MicrophoneOption } from '../../../recording/microphone';
import type { WebcamOption } from '../../../recording/webcam';
import type { RecordingControlCapability } from '../recording-control-capability';

export interface PopupRuntimeRecordingControls {
  recordingControlCapability: RecordingControlCapability | null;
  videoCaptureMode: CaptureMode;
  selectedPresetId: string | null;
  selectedPreset: ViewportPreset | null;
  appliedViewportPresetId: string | null;
  appliedViewportTabId: number | null;
  videoSettings: VideoRecordingSettings;
  recordingState: VideoRecordingRuntimeState;
  startError: string | null;
  isStartPending: boolean;
  recordingActive: boolean;
  microphoneDevices: MicrophoneOption[];
  isLoadingMicrophones: boolean;
  webcamDevices: WebcamOption[];
  isLoadingWebcams: boolean;
  setVideoCaptureMode: Dispatch<SetStateAction<CaptureMode>>;
  setSelectedPresetId: Dispatch<SetStateAction<string | null>>;
  setAppliedViewportPresetId: Dispatch<SetStateAction<string | null>>;
  setAppliedViewportTabId: Dispatch<SetStateAction<number | null>>;
  setStartError: Dispatch<SetStateAction<string | null>>;
  setVideoSettings: Dispatch<SetStateAction<VideoRecordingSettings>>;
  setRecordingState: Dispatch<SetStateAction<VideoRecordingRuntimeState>>;
  clearStartError: () => void;
}
