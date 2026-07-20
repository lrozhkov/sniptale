import { expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));
import { createVideoExportCapabilities } from '../../../features/video/project/export/capabilities';
import { VideoExportFormat, VideoMp4Codec } from '../../../features/video/project/types';
import { getMp4CodecOptions } from './codec-options';

it('builds codec options from available MP4 capabilities in priority order', () => {
  expect(
    getMp4CodecOptions(
      createVideoExportCapabilities({
        formats: [{ format: VideoExportFormat.MP4, available: true }],
        mp4Codecs: [
          { codec: VideoMp4Codec.AVC, available: true },
          { codec: VideoMp4Codec.HEVC, available: true },
          { codec: VideoMp4Codec.VP9, available: false, reason: 'CODEC_UNSUPPORTED' },
        ],
      })
    )
  ).toEqual([
    { value: VideoMp4Codec.AVC, label: 'videoEditor.exportDialog.codecAvcLabel' },
    { value: VideoMp4Codec.HEVC, label: 'videoEditor.exportDialog.codecHevcLabel' },
  ]);
});
