import type { TranslationKey } from '../../../platform/i18n';
import {
  VideoExportQualityPreset,
  VideoMp4Codec,
  type VideoMp4Codec as VideoMp4CodecType,
} from '../../../features/video/project/types/export';

interface Mp4VideoEncoderCandidate {
  codecFamily: VideoMp4CodecType;
  muxerCodec: 'avc' | 'hevc' | 'vp9';
  labelKey: TranslationKey;
  codec: string;
  hardwareAcceleration: HardwareAcceleration;
  avcFormat?: AvcBitstreamFormat;
}

interface Mp4AudioEncoderCandidate {
  muxerCodec: 'aac' | 'opus';
  labelKey: TranslationKey;
  codec: string;
  bitrate: number;
}

export const MP4_CODEC_PRIORITY: readonly VideoMp4CodecType[] = [
  VideoMp4Codec.AVC,
  VideoMp4Codec.HEVC,
  VideoMp4Codec.VP9,
] as const;

export const EXPORT_BITRATES_BY_CODEC: Record<
  VideoMp4CodecType,
  Record<VideoExportQualityPreset, number>
> = {
  [VideoMp4Codec.AVC]: {
    [VideoExportQualityPreset.DRAFT]: 4_000_000,
    [VideoExportQualityPreset.BALANCED]: 8_000_000,
    [VideoExportQualityPreset.HIGH]: 12_000_000,
  },
  [VideoMp4Codec.HEVC]: {
    [VideoExportQualityPreset.DRAFT]: 2_800_000,
    [VideoExportQualityPreset.BALANCED]: 5_600_000,
    [VideoExportQualityPreset.HIGH]: 8_400_000,
  },
  [VideoMp4Codec.VP9]: {
    [VideoExportQualityPreset.DRAFT]: 3_200_000,
    [VideoExportQualityPreset.BALANCED]: 6_400_000,
    [VideoExportQualityPreset.HIGH]: 9_600_000,
  },
};

const MP4_AUDIO_BITRATE = 192_000;
const MP4_OPUS_AUDIO_BITRATE = 160_000;

const MP4_AVC_ENCODER_CANDIDATES: readonly Mp4VideoEncoderCandidate[] = [
  {
    codecFamily: VideoMp4Codec.AVC,
    muxerCodec: 'avc',
    labelKey: 'offscreenExport.codecH264HighAutoLabel',
    codec: 'avc1.640028',
    hardwareAcceleration: 'no-preference',
    avcFormat: 'avc',
  },
  {
    codecFamily: VideoMp4Codec.AVC,
    muxerCodec: 'avc',
    labelKey: 'offscreenExport.codecH264MainAutoLabel',
    codec: 'avc1.4D401F',
    hardwareAcceleration: 'no-preference',
    avcFormat: 'avc',
  },
  {
    codecFamily: VideoMp4Codec.AVC,
    muxerCodec: 'avc',
    labelKey: 'offscreenExport.codecH264ConstrainedBaselineAutoLabel',
    codec: 'avc1.42E01E',
    hardwareAcceleration: 'no-preference',
    avcFormat: 'avc',
  },
  {
    codecFamily: VideoMp4Codec.AVC,
    muxerCodec: 'avc',
    labelKey: 'offscreenExport.codecH264HighHwLabel',
    codec: 'avc1.640028',
    hardwareAcceleration: 'prefer-hardware',
    avcFormat: 'avc',
  },
  {
    codecFamily: VideoMp4Codec.AVC,
    muxerCodec: 'avc',
    labelKey: 'offscreenExport.codecH264HighSwLabel',
    codec: 'avc1.640028',
    hardwareAcceleration: 'prefer-software',
    avcFormat: 'avc',
  },
  {
    codecFamily: VideoMp4Codec.AVC,
    muxerCodec: 'avc',
    labelKey: 'offscreenExport.codecH264MainHwLabel',
    codec: 'avc1.4D401F',
    hardwareAcceleration: 'prefer-hardware',
    avcFormat: 'avc',
  },
  {
    codecFamily: VideoMp4Codec.AVC,
    muxerCodec: 'avc',
    labelKey: 'offscreenExport.codecH264MainSwLabel',
    codec: 'avc1.4D401F',
    hardwareAcceleration: 'prefer-software',
    avcFormat: 'avc',
  },
  {
    codecFamily: VideoMp4Codec.AVC,
    muxerCodec: 'avc',
    labelKey: 'offscreenExport.codecH264ConstrainedBaselineHwLabel',
    codec: 'avc1.42E01E',
    hardwareAcceleration: 'prefer-hardware',
    avcFormat: 'avc',
  },
  {
    codecFamily: VideoMp4Codec.AVC,
    muxerCodec: 'avc',
    labelKey: 'offscreenExport.codecH264ConstrainedBaselineSwLabel',
    codec: 'avc1.42E01E',
    hardwareAcceleration: 'prefer-software',
    avcFormat: 'avc',
  },
  {
    codecFamily: VideoMp4Codec.AVC,
    muxerCodec: 'avc',
    labelKey: 'offscreenExport.codecH264BaselineSwLabel',
    codec: 'avc1.42001E',
    hardwareAcceleration: 'prefer-software',
    avcFormat: 'avc',
  },
];

const MP4_HEVC_ENCODER_CANDIDATES: readonly Mp4VideoEncoderCandidate[] = [
  {
    codecFamily: VideoMp4Codec.HEVC,
    muxerCodec: 'hevc',
    labelKey: 'offscreenExport.codecHevcAutoLabel',
    codec: 'hvc1.1.6.L123.B0',
    hardwareAcceleration: 'no-preference',
  },
  {
    codecFamily: VideoMp4Codec.HEVC,
    muxerCodec: 'hevc',
    labelKey: 'offscreenExport.codecHevcHwLabel',
    codec: 'hvc1.1.6.L123.B0',
    hardwareAcceleration: 'prefer-hardware',
  },
  {
    codecFamily: VideoMp4Codec.HEVC,
    muxerCodec: 'hevc',
    labelKey: 'offscreenExport.codecHevcSwLabel',
    codec: 'hvc1.1.6.L123.B0',
    hardwareAcceleration: 'prefer-software',
  },
];

const MP4_VP9_ENCODER_CANDIDATES: readonly Mp4VideoEncoderCandidate[] = [
  {
    codecFamily: VideoMp4Codec.VP9,
    muxerCodec: 'vp9',
    labelKey: 'offscreenExport.codecVp9SwLabel',
    codec: 'vp09.00.10.08',
    hardwareAcceleration: 'prefer-software',
  },
  {
    codecFamily: VideoMp4Codec.VP9,
    muxerCodec: 'vp9',
    labelKey: 'offscreenExport.codecVp9HwLabel',
    codec: 'vp09.00.10.08',
    hardwareAcceleration: 'prefer-hardware',
  },
];

export const MP4_VIDEO_ENCODER_CANDIDATES_BY_CODEC: Record<
  VideoMp4CodecType,
  readonly Mp4VideoEncoderCandidate[]
> = {
  [VideoMp4Codec.AVC]: MP4_AVC_ENCODER_CANDIDATES,
  [VideoMp4Codec.HEVC]: MP4_HEVC_ENCODER_CANDIDATES,
  [VideoMp4Codec.VP9]: MP4_VP9_ENCODER_CANDIDATES,
};

export const MP4_AUDIO_ENCODER_CANDIDATES: readonly Mp4AudioEncoderCandidate[] = [
  {
    muxerCodec: 'aac',
    labelKey: 'offscreenExport.codecAacLabel',
    codec: 'mp4a.40.2',
    bitrate: MP4_AUDIO_BITRATE,
  },
  {
    muxerCodec: 'opus',
    labelKey: 'offscreenExport.codecOpusLabel',
    codec: 'opus',
    bitrate: MP4_OPUS_AUDIO_BITRATE,
  },
];
