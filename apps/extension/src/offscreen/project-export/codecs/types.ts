import { type VideoMp4Codec } from '../../../features/video/project/types/export';

export interface ExportAudioSettings {
  numberOfChannels: number;
  sampleRate: number;
}

export interface SupportedMp4VideoEncoder {
  codec: VideoMp4Codec;
  muxerCodec: 'avc' | 'hevc' | 'vp9';
  label: string;
  config: VideoEncoderConfig;
}

export interface SupportedMp4AudioEncoder {
  muxerCodec: 'aac' | 'opus';
  label: string;
  config: AudioEncoderConfig;
}
