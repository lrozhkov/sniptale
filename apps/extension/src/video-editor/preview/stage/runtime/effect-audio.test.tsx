// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { usePreviewEffectAudio } from './effect-audio';
import { createVideoProjectFromRecording } from '../../../../features/video/project/factories/creation';
import { applyVideoProjectMutationPatch } from '../../../../features/video/project/mutation';
import type { RecordingProjectActionAudioSource } from '../../../../workflows/video-review/recording-action-audio';
import type { VideoProject } from '../../../../features/video/project/types';

const mocks = vi.hoisted(() => ({
  createSource: vi.fn(),
  prepareVoice: vi.fn(async () => undefined),
  closeVoice: vi.fn(),
  closeAction: vi.fn(async () => undefined),
}));
vi.mock('../../../../workflows/video-review/recording-action-audio', () => ({
  createRecordingProjectActionAudioSource: mocks.createSource,
}));
vi.mock('./source-voiceover-audio', () => ({
  createProjectSourceVoiceoverAudioRuntime: () => ({
    prepare: mocks.prepareVoice,
    sync: async () => undefined,
    close: mocks.closeVoice,
    reset: () => undefined,
  }),
}));
vi.mock('./action-audio', () => ({
  createProjectActionAudioRuntime: () => ({
    sync: async () => undefined,
    close: mocks.closeAction,
    reset: () => undefined,
    prepare: async (
      args: { recordingSource: RecordingProjectActionAudioSource },
      signal: AbortSignal
    ) => {
      await args.recordingSource.admit(signal);
    },
  }),
}));

it('keeps playback preparation stable while render-only windows change and waits for complete admission', async () => {
  const base = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'source.webm',
    width: 640,
    height: 360,
    duration: 61,
    mimeType: 'video/webm',
    size: 100,
    hasAudio: false,
    recordingSignals: [],
    sourceNormalizedActionEvents: [],
  });
  const project = applyVideoProjectMutationPatch(base, {
    actionFeedback: base.actionFeedback!.map((group) => ({
      ...group,
      events: {
        format: 'recording-events-v1',
        formatVersion: 1,
        algorithm: 'lossless-v1',
        encoding: 'json-utf8-v1',
        eventStreamId: 'a'.repeat(32),
        state: 'complete',
        finalized: true,
        totalBlocks: 1,
        totalRecords: 4,
        totalBytes: 2000,
        streamSha256: 'b'.repeat(64),
      },
      settings: [
        {
          ref: { kind: 'signal', id: 'typing' },
          enabled: true,
          presetId: 'typing-recorded-v2',
          volume: 0.5,
          offset: 0,
        },
      ],
    })),
  });
  const admitted = Promise.withResolvers<{
    maxVoices: number;
    busGain: number;
    sampleIds: [];
    firstCueTime: null;
  }>();
  const source = {
    duration: 61,
    admit: vi.fn(() => admitted.promise),
    readWindow: vi.fn(),
    dispose: vi.fn(),
  };
  mocks.createSource.mockReturnValue(source);
  const feedback = {
    failed: false,
    onFailure: vi.fn(),
    onRecovery: vi.fn(),
    onRetry: vi.fn(),
    retryVersion: 0,
  };
  const urls = {};
  let latest: ReturnType<typeof usePreviewEffectAudio> | undefined;
  function Harness({ preview }: { preview: VideoProject }) {
    latest = usePreviewEffectAudio({
      assetUrls: urls,
      currentTime: 0,
      feedback,
      isPlaying: false,
      project: preview,
      recordingProject: project,
    });
    return null;
  }
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Harness preview={{ ...project, fps: 24 }} />));
    const authority = latest!;
    let completed = false;
    const request = { time: 0, isPlaying: true, signal: new AbortController().signal };
    const pending = authority(request).then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(source.admit).toHaveBeenCalledOnce();
    expect(completed).toBe(false);
    await act(async () => root.render(<Harness preview={{ ...project, fps: 30 }} />));
    expect(latest).toBe(authority);
    expect(mocks.createSource).toHaveBeenCalledOnce();
    expect(completed).toBe(false);
    admitted.resolve({ maxVoices: 0, busGain: 1, sampleIds: [], firstCueTime: null });
    await pending;
    expect(completed).toBe(true);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
  expect(source.dispose).toHaveBeenCalledOnce();
});
