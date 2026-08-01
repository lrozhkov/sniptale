import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';

export interface RegionCaptureSettings extends Pick<VideoRecordingSettings, 'output' | 'quality'> {
  systemAudioEnabled: boolean;
  microphoneEnabled: boolean;
}

export interface CaptureProgress {
  type: 'CHUNK' | 'STARTED' | 'STOPPED' | 'ERROR';
  data?: Blob;
  error?: string;
  size?: number;
}
