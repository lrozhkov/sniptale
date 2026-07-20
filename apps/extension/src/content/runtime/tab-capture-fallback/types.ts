import type { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';

export interface TabCaptureSettings {
  quality: VideoQuality;
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
