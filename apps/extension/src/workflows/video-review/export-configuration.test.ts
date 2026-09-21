import { expect, it } from 'vitest';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { ReviewMediaIndex } from './media-index';
import { configuredReviewExportPlan } from './export-configuration';

function fixture() {
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  const index: ReviewMediaIndex = {
    duration: 12,
    boundaries: [0, 12],
    videoCodec: 'avc',
    audioCodec: 'aac',
    container: 'mp4',
    rotation: 0,
    width: 1904,
    height: 984,
    frameRate: 40,
    outputCodecs: { mp4: ['avc', 'hevc', 'vp9'], webm: ['vp9', 'vp8'] },
    outputAudioCodecs: { mp4: 'aac', webm: 'opus' },
  };
  return {
    advanced,
    index,
    document: { edits: [], canvasComments: [] },
    renderSettings: {
      format: 'webm' as const,
      codec: 'vp9' as const,
      frameRate: 30 as const,
      quality: 'HIGH' as const,
    },
  };
}
it('honors advanced output settings without visual effects, transcoding AAC for WebM', () => {
  expect(configuredReviewExportPlan(fixture())).toMatchObject({
    kind: 'ready',
    video: 'render',
    audio: 'process',
  });
});
it('keeps basic editing lossless and ignores inactive advanced output choices', () => {
  const args = fixture();
  args.advanced.ui.mode = 'basic';
  expect(configuredReviewExportPlan(args)).toMatchObject({
    kind: 'ready',
    video: 'copy',
    audio: 'copy',
  });
});
it('blocks incompatible and unavailable codecs without substituting a different format', () => {
  const args = fixture();
  expect(
    configuredReviewExportPlan({
      ...args,
      renderSettings: { ...args.renderSettings, codec: 'avc' },
    })
  ).toMatchObject({ kind: 'unavailable', reasons: ['video-encoder'] });
  args.index.outputAudioCodecs!.webm = null;
  expect(configuredReviewExportPlan(args)).toMatchObject({
    kind: 'unavailable',
    reasons: ['audio-encoder'],
  });
});
it('does not require an audio encoder for silent output and preserves compatible Opus', () => {
  const args = fixture();
  args.index.audioCodec = null;
  args.index.outputAudioCodecs!.webm = null;
  expect(configuredReviewExportPlan(args)).toMatchObject({ kind: 'ready', audio: 'copy' });
  args.index.audioCodec = 'opus';
  expect(configuredReviewExportPlan(args)).toMatchObject({ kind: 'ready', audio: 'copy' });
});
