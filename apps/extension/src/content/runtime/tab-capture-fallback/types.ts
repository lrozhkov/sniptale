import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';

export interface TabCaptureSettings extends Pick<VideoRecordingSettings, 'output' | 'quality'> {
  streamId: string;
  systemAudioEnabled: boolean;
  microphoneEnabled: boolean;
}

export interface CaptureProgress {
  type: 'CHUNK' | 'STARTED' | 'STOPPED' | 'ERROR';
  data?: Blob;
  error?: string;
  size?: number;
}

export interface ResolvedTabCaptureStream {
  audioContext?: AudioContext | null;
  stream: MediaStream;
  micStream: MediaStream | null;
}
