import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';

export interface PopupRuntimeActionHandlers {
  handleToggleMicrophone: () => void;
  handleToggleWebcam: () => void;
  handleUpdateRecordingSettings: (settings: Partial<VideoRecordingSettings>) => Promise<void>;
  handleStartRecording: () => Promise<void>;
  handlePauseResume: () => Promise<void>;
  handleStop: (options?: { cancelStart?: boolean; discard?: boolean }) => Promise<void>;
}
