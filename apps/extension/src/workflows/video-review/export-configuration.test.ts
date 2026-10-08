import { createQuickEditWatermark } from '../../features/video/review/advanced/watermark';
import { DEFAULT_WINDOW_HEADER } from '../../features/browser-frame/header';
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

it('explains an oversized decorated output and accepts a smaller export preset', () => {
  const args = fixture();
  args.advanced.windowHeader = {
    ...DEFAULT_WINDOW_HEADER,
    kind: 'browser' as const,
    title: 'Browser',
  };
  args.advanced.canvas = { width: 7680, height: 4320 };
  expect(configuredReviewExportPlan(args)).toEqual({
    kind: 'unavailable',
    reasons: ['canvas-size'],
  });
  expect(
    configuredReviewExportPlan({
      ...args,
      renderSettings: { ...args.renderSettings, resolution: '1080P' },
    })
  ).toMatchObject({ kind: 'ready', video: 'render' });
});

it.each(['text', 'image'] as const)(
  'requires rendering for an isolated %s watermark and restores copy when suppressed',
  (mode) => {
    const fixtureArgs = fixture();
    const args = {
      advanced: fixtureArgs.advanced,
      index: fixtureArgs.index,
      document: fixtureArgs.document,
    };
    // No output override, cut, zoom, background, camera or other effect can force this transition.
    expect(configuredReviewExportPlan(args)).toMatchObject({
      kind: 'ready',
      video: 'copy',
      audio: 'copy',
    });
    args.advanced.watermark = {
      ...createQuickEditWatermark('Saved'),
      mode,
      ...(mode === 'image'
        ? {
            image: { assetId: 'project-asset:logo', width: 100, height: 50, size: 0.2, opacity: 1 },
          }
        : {}),
    };
    expect(configuredReviewExportPlan(args)).toMatchObject({
      kind: 'ready',
      video: 'render',
      audio: 'copy',
      reasons: ['watermark'],
    });
    args.advanced.watermark.mode = 'none';
    expect(configuredReviewExportPlan(args)).toMatchObject({
      kind: 'ready',
      video: 'copy',
      audio: 'copy',
    });
    args.advanced.watermark.mode = mode;
    args.advanced.ui.mode = 'basic';
    expect(configuredReviewExportPlan(args)).toMatchObject({
      kind: 'ready',
      video: 'copy',
      audio: 'copy',
    });
  }
);

it('uses sequence processing for bookends and defers unknown silent-main video audio', async () => {
  const { createNeutralPresentationSettings } =
    await import('../../features/video/review/advanced/presentation');
  const base = fixture();
  const args = { advanced: base.advanced, document: base.document, index: base.index };
  args.advanced.presentation = createNeutralPresentationSettings();
  args.advanced.presentation.intro = {
    mode: 'video',
    video: {
      assetId: 'project-asset:clip',
      source: { width: 20, height: 10, duration: 2, size: 5, mimeType: 'video/webm' },
      trim: { start: 0, end: 2 },
      audio: { muted: false, gain: 1 },
      fit: 'contain',
      fillColor: '#000000ff',
      crop: { panX: 0, panY: 0 },
    },
  };
  expect(configuredReviewExportPlan(args)).toMatchObject({
    kind: 'ready',
    video: 'render',
    audio: 'process',
    reasons: ['presentation'],
  });
  args.index.outputAudioCodecs!.mp4 = null;
  expect(configuredReviewExportPlan(args)).toEqual({
    kind: 'unavailable',
    reasons: ['audio-encoder'],
  });
  args.index.audioCodec = null;
  expect(configuredReviewExportPlan(args)).toMatchObject({
    kind: 'ready',
    video: 'render',
    audio: 'process',
  });
  expect(configuredReviewExportPlan({ ...args, presentationAudioPresent: true })).toEqual({
    kind: 'unavailable',
    reasons: ['audio-encoder'],
  });
  expect(configuredReviewExportPlan({ ...args, presentationAudioPresent: false })).toMatchObject({
    kind: 'ready',
  });
  args.advanced.presentation.intro.video.audio.muted = true;
  expect(configuredReviewExportPlan(args)).toMatchObject({
    kind: 'ready',
    video: 'render',
    audio: 'process',
  });
  args.advanced.presentation.intro = {
    mode: 'none',
    video: args.advanced.presentation.intro.video,
  };
  expect(configuredReviewExportPlan(args)).toEqual({
    kind: 'ready',
    video: 'copy',
    audio: 'copy',
    reasons: [],
  });
});

it('exports silent image sequences without an audio encoder and suppresses presentation in Basic', async () => {
  const { createNewWorkspacePresentationSettings } =
    await import('../../features/video/review/advanced/presentation');
  const base = fixture();
  const args = { advanced: base.advanced, document: base.document, index: base.index };
  args.index.audioCodec = null;
  args.index.outputAudioCodecs!.mp4 = null;
  args.advanced.presentation = createNewWorkspacePresentationSettings();
  args.advanced.presentation.audioFade = true;
  args.advanced.presentation.outro = {
    mode: 'image',
    image: {
      assetId: 'project-asset:still',
      width: 20,
      height: 10,
      duration: 3,
      fit: 'contain',
      fillColor: '#000000ff',
      crop: { panX: 0, panY: 0 },
    },
  };
  expect(configuredReviewExportPlan(args)).toMatchObject({
    kind: 'ready',
    video: 'render',
    audio: 'process',
  });
  args.advanced.ui.mode = 'basic';
  expect(configuredReviewExportPlan(args)).toEqual({
    kind: 'ready',
    video: 'copy',
    audio: 'copy',
    reasons: [],
  });
});

it('omits bookend capabilities without mutating retained media or outer fades', async () => {
  const { createNewWorkspacePresentationSettings } =
    await import('../../features/video/review/advanced/presentation');
  const args = fixture();
  args.advanced.presentation = createNewWorkspacePresentationSettings();
  args.advanced.presentation.intro = {
    mode: 'image',
    image: {
      assetId: 'project-asset:intro',
      width: 20,
      height: 10,
      duration: 3,
      fit: 'contain',
      fillColor: '#000000ff',
      crop: { panX: 0, panY: 0 },
    },
  };
  const before = structuredClone(args.advanced);
  const result = configuredReviewExportPlan({ ...args, includeBookends: false });
  expect(result).toMatchObject({
    kind: 'ready',
    video: 'render',
    reasons: expect.arrayContaining(['presentation']),
  });
  expect(args.advanced).toEqual(before);
  args.advanced.presentation.fadeIn.enabled = false;
  args.advanced.presentation.fadeOut.enabled = false;
  expect(
    configuredReviewExportPlan({ ...args, renderSettings: undefined, includeBookends: false })
  ).toMatchObject({ kind: 'ready', video: 'copy', audio: 'copy', reasons: [] });
});
