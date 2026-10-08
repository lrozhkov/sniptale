import { expect, it } from 'vitest';
import { createPresentationPreviewBuffer } from './presentation-preview';

it('supports muxer header rewrites and sparse positioned writes without persistence', async () => {
  const output = createPresentationPreviewBuffer(new AbortController().signal);
  await output.writeAt(4, new Blob(['body']));
  await output.writeAt(0, new Blob(['HEAD']));
  await output.writeAt(1, new Blob(['i']));
  expect(await output.finish('video/mp4').text()).toBe('HiADbody');
  output.dispose();
  expect(output.finish('video/mp4').size).toBe(0);
});
it('rejects unsafe positions and oversized output before reading chunks', async () => {
  const output = createPresentationPreviewBuffer(new AbortController().signal);
  for (const position of [-1, NaN, Infinity, 0.5, 64 * 1024 * 1024])
    await expect(output.writeAt(position, new Blob(['x']))).rejects.toThrow('budget');
});
it('honors cancellation before reads, after reads, and before publication', async () => {
  const controller = new AbortController();
  const output = createPresentationPreviewBuffer(controller.signal);
  const chunk = new Blob(['x']);
  const original = chunk.arrayBuffer.bind(chunk);
  chunk.arrayBuffer = async () => {
    const bytes = await original();
    controller.abort();
    return bytes;
  };
  await expect(output.writeAt(0, chunk)).rejects.toThrow();
  expect(() => output.finish('video/mp4')).toThrow();
  await expect(output.writeAt(0, new Blob(['y']))).rejects.toThrow();
  output.dispose();
});

it('uses the original late sequence lattice and a bounded unpublished writer', async () => {
  const { createQuickEditAdvancedState } =
    await import('../../features/video/review/advanced/defaults');
  const { createNewWorkspacePresentationSettings } =
    await import('../../features/video/review/advanced/presentation');
  const { preparePresentationPreview, renderPresentationPreview } =
    await import('./presentation-preview');
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  advanced.presentation = createNewWorkspacePresentationSettings();
  const input: import('./presentation-preview').PresentationPreviewInput = {
    file: new Blob(),
    index: {
      duration: 3600,
      boundaries: [0, 3600],
      videoCodec: 'avc',
      audioCodec: null,
      container: 'mp4',
      rotation: 0,
      width: 1920,
      height: 1080,
      frameRate: 60,
      processedVideoCodec: 'avc',
    },
    advanced,
    edits: [],
    fragmentOffset: 0,
    readProjectAsset: async () => null,
  };
  const plan = preparePresentationPreview(input, 'outro', {
    rasterPreset: 'current',
    frameRate: 'current',
    pausedQuality: 'same',
    showFrameRate: false,
  });
  expect(plan.width).toBeLessThanOrEqual(640);
  expect(plan.height).toBeLessThanOrEqual(640);
  const controller = new AbortController();
  const blob = await renderPresentationPreview(input, plan, 'end', controller.signal, {
    audio: async () => ({
      entries: [],
      buffers: new Map(),
      originalVolume: 1,
      originalMuted: false,
    }),
    write: async (args, preview) => {
      expect(args.file).toBe(input.file);
      expect(args.provenance).toBeUndefined();
      expect(preview!.window.startUs).toBeGreaterThan(3590_000_000);
      expect(preview!.window.endUs - preview!.window.startUs).toBeLessThanOrEqual(4_000_000);
      await args.writer.writeAt(0, new Blob(['clip']));
      return {
        videoPackets: 1,
        audioPackets: 0,
        resultDuration: 3,
        audioRanges: [],
        audioReencoded: false,
        outputAudioCodec: null,
        videoReencoded: true,
      };
    },
  });
  expect(await blob.text()).toBe('clip');
  expect(blob.type).toBe('video/mp4');
});

it('uses the actual fragment map for Revoice and keeps attenuation source-native in a bounded preview', async () => {
  const { createQuickEditAdvancedState } =
    await import('../../features/video/review/advanced/defaults');
  const { createNewWorkspacePresentationSettings } =
    await import('../../features/video/review/advanced/presentation');
  const { preparePresentationPreview, renderPresentationPreview } =
    await import('./presentation-preview');
  const { buildReviewExportClipPlan } = await import('./export-lifecycle');
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  advanced.presentation = createNewWorkspacePresentationSettings();
  advanced.audio.originalSpeech = {
    enabled: true,
    transcript: {
      version: 1,
      phrases: [],
      replacements: [
        {
          id: 'accepted',
          phraseId: 'p',
          start: 2,
          end: 8,
          duration: 4,
          enabled: true,
          originalVolume: 0.25,
          assetId: 'project-asset:accepted',
          revision: 0,
          text: 'accepted',
          textSignature: 'test',
          profile: { modelId: 'tts', voiceId: 'voice', responseFormat: 'wav' },
        },
      ],
    },
  };
  const input: import('./presentation-preview').PresentationPreviewInput = {
    file: new Blob(),
    advanced,
    index: {
      duration: 10,
      boundaries: [0, 10],
      videoCodec: 'avc',
      audioCodec: null,
      container: 'mp4',
      rotation: 0,
      width: 320,
      height: 180,
      frameRate: 30,
      processedVideoCodec: 'avc',
    },
    edits: [
      { id: 'head', kind: 'cut', start: 0, end: 4, requestedStart: 0, requestedEnd: 4 },
      {
        id: 'speed',
        kind: 'speed',
        start: 4,
        end: 8,
        requestedStart: 4,
        requestedEnd: 8,
        rate: 2,
        audio: 'mute',
      },
      { id: 'tail', kind: 'cut', start: 8, end: 10, requestedStart: 8, requestedEnd: 10 },
    ],
    fragmentOffset: 3,
    readProjectAsset: async () => new Blob(['accepted']),
  };
  const plan = preparePresentationPreview(input, 'outro', {
    rasterPreset: 'current',
    frameRate: 'current',
    pausedQuality: 'same',
    showFrameRate: false,
  });
  const blob = await renderPresentationPreview(input, plan, 'end', new AbortController().signal, {
    audio: (args) =>
      buildReviewExportClipPlan(args, {
        openAudioSource: async () => ({
          sampleRate: 48000,
          numberOfChannels: 1,
          length: 4 * 48000,
          read: async (start, end) => ({ start, planes: [new Float32Array(end - start)] }),
          dispose: () => undefined,
        }),
      }),
    write: async (args) => {
      expect(args.exportAudio!.entries).toMatchObject([
        { lane: 'revoice', timelineStart: 0, duration: 1, sourceOffset: 2, playbackRate: 2 },
      ]);
      expect(args.exportAudio!.automaticOriginalRanges).toEqual([
        { start: 2, end: 8, volume: 0.25 },
      ]);
      await args.writer.writeAt(0, new Blob(['clip']));
      return {
        videoPackets: 1,
        audioPackets: 1,
        resultDuration: 2,
        audioRanges: [],
        audioReencoded: true,
        outputAudioCodec: 'aac',
        videoReencoded: true,
      };
    },
  });
  expect(await blob.text()).toBe('clip');
});
