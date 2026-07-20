import type { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';

export interface RegionCaptureSettings {
  quality: VideoQuality;
  systemAudioEnabled: boolean;
  microphoneEnabled: boolean;
}

export interface CaptureProgress {
  type: 'CHUNK' | 'STARTED' | 'STOPPED' | 'ERROR';
  data?: Blob;
  error?: string;
  size?: number;
}
