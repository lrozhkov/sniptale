import { beforeEach, expect, it, vi } from 'vitest';

const {
  loadImagesForProjectMock,
  loggerWarnMock,
  preloadClipVideosMock,
  renderOfflineAudioMixMock,
} = vi.hoisted(() => ({
  loadImagesForProjectMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  preloadClipVideosMock: vi.fn(),
  renderOfflineAudioMixMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    warn: loggerWarnMock,
  }),
}));

vi.mock('../media-loading', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../media-loading')>()),
  loadImagesForProject: loadImagesForProjectMock,
  preloadClipVideos: preloadClipVideosMock,
}));

vi.mock('../offline-audio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../offline-audio')>()),
  renderOfflineAudioMix: renderOfflineAudioMixMock,
}));

vi.mock('../media-playback', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../media-playback')>()),
  syncClipPlayback: vi.fn(),
  syncVideoClipFrame: vi.fn(),
}));
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  type VideoProject,
  type VideoProjectExportSettings,
} from '../../../features/video/project/types';
import { setupExportAudio, type ProjectExportMediaState } from './index';

beforeEach(() => {
  vi.clearAllMocks();
});

function createProject(): VideoProject {
  return { ...createEmptyVideoProject('Project', 1280, 720), duration: 10, id: 'project-1' };
}

function createAudioJob(): ProjectExportMediaState {
  return {
    clipMediaElements: new Map(),
    clipAudioNodes: new Map(),
    audioContext: null,
    audioDestination: null,
    exportAudioSettings: null,
    assetUrls: [],
  };
}

function createSettings(): VideoProjectExportSettings {
  return {
    downloadAfterExport: false,
    format: VideoExportFormat.WEBM,
    fps: 30,
    height: 720,
    quality: VideoExportQualityPreset.BALANCED,
    width: 1280,
  };
}

function createAudioContextMock(overrides: Record<string, unknown> = {}) {
  return {
    state: 'running',
    sampleRate: 44_100,
    createBufferSource: vi.fn(),
    createMediaStreamDestination: vi.fn(() => ({
      channelCount: 0,
      stream: {
        getAudioTracks: () => [],
      },
    })),
    resume: vi.fn(),
    ...overrides,
  };
}

function stubAudioContext(audioContext: object) {
  function AudioContextMock() {
    return audioContext;
  }

  vi.stubGlobal('AudioContext', AudioContextMock as unknown as typeof AudioContext);
}

it('returns no audio tracks when no clips need rendered audio', async () => {
  renderOfflineAudioMixMock.mockResolvedValue(null);
  const job = createAudioJob();

  await expect(setupExportAudio(createProject(), createSettings(), job)).resolves.toEqual({
    dispose: expect.any(Function),
    start: expect.any(Function),
    tracks: [],
  });
  expect(job.exportAudioSettings).toBeNull();
});

function createSuspendedAudioContext() {
  const connectSource = vi.fn();
  const disconnectSource = vi.fn();
  const startSource = vi.fn();
  const stopSource = vi.fn();
  const audioTrack = { id: 'track-1' };
  const source = {
    buffer: null,
    connect: connectSource,
    disconnect: disconnectSource,
    start: startSource,
    stop: stopSource,
  };
  const createBufferSource = vi.fn(() => source);
  const resume = vi.fn().mockRejectedValue(new Error('resume failed'));

  const audioContext = createAudioContextMock({
    state: 'suspended',
    sampleRate: 48_000,
    createBufferSource,
    createMediaStreamDestination: vi.fn(() => ({
      channelCount: 2,
      stream: {
        getAudioTracks: () => [audioTrack],
      },
    })),
    resume,
  });

  return {
    audioContext,
    audioTrack,
    connectSource,
    createBufferSource,
    disconnectSource,
    resume,
    source,
    startSource,
    stopSource,
  };
}

it('connects the shared offline mix and logs failed AudioContext resumes', async () => {
  const suspended = createSuspendedAudioContext();
  const job = createAudioJob();
  const buffer = { id: 'offline-mix' };

  stubAudioContext(suspended.audioContext);
  renderOfflineAudioMixMock.mockResolvedValue({
    buffer,
    settings: { numberOfChannels: 2, sampleRate: 48_000 },
  });

  const prepared = await setupExportAudio(createProject(), createSettings(), job);

  expect(suspended.resume).toHaveBeenCalledOnce();
  expect(loggerWarnMock).toHaveBeenCalledWith('Failed to resume AudioContext', expect.any(Error));
  expect(suspended.createBufferSource).toHaveBeenCalledOnce();
  expect(suspended.source.buffer).toBe(buffer);
  expect(suspended.connectSource).toHaveBeenCalledOnce();
  expect(job.exportAudioSettings).toEqual({
    numberOfChannels: 2,
    sampleRate: 48_000,
  });
  expect(prepared.tracks).toEqual([suspended.audioTrack]);
  prepared.start();
  prepared.start();
  expect(suspended.startSource).toHaveBeenCalledOnce();
  prepared.dispose();
  expect(suspended.stopSource).toHaveBeenCalledOnce();
  expect(suspended.disconnectSource).toHaveBeenCalledOnce();
});

it('does not resume an already running context and forwards the export abort signal', async () => {
  const audioContext = createAudioContextMock();
  const source = {
    buffer: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  audioContext.createBufferSource.mockReturnValue(source);
  const job = createAudioJob();
  const signal = new AbortController().signal;

  stubAudioContext(audioContext);
  renderOfflineAudioMixMock.mockResolvedValue({
    buffer: {},
    settings: { numberOfChannels: 2, sampleRate: 44_100 },
  });

  const prepared = await setupExportAudio(createProject(), createSettings(), job, signal);

  expect(audioContext.resume).not.toHaveBeenCalled();
  expect(renderOfflineAudioMixMock).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'project-1' }),
    createSettings(),
    signal
  );
  expect(job.exportAudioSettings).toEqual({
    numberOfChannels: 2,
    sampleRate: 44_100,
  });
  expect(prepared.tracks).toEqual([]);
  expect(loggerWarnMock).not.toHaveBeenCalled();
});
