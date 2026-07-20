import { translate } from '../../../../platform/i18n';
import { MP4_AUDIO_ENCODER_CANDIDATES } from '../constants';
import type { ExportAudioSettings, SupportedMp4AudioEncoder } from '../types';
import { probeSupportedEncoderCandidate } from './support';

export async function getSupportedMp4AudioEncoder(
  audioSettings: ExportAudioSettings
): Promise<SupportedMp4AudioEncoder> {
  return probeSupportedEncoderCandidate({
    candidates: MP4_AUDIO_ENCODER_CANDIDATES,
    getCodec: (candidate) => candidate.codec,
    getLabel: (candidate) => translate(candidate.labelKey),
    createConfig: (candidate): AudioEncoderConfig => ({
      codec: candidate.codec,
      sampleRate: audioSettings.sampleRate,
      numberOfChannels: audioSettings.numberOfChannels,
      bitrate: candidate.bitrate,
    }),
    isConfigSupported: (config) => AudioEncoder.isConfigSupported(config),
    onSupported: (candidate, label, config) => ({
      muxerCodec: candidate.muxerCodec,
      label,
      config,
    }),
    prefixKey: 'offscreenExport.supportedAudioEncoderMissingPrefix',
    suffixKey: 'offscreenExport.supportedAudioEncoderMissingSuffix',
  });
}
