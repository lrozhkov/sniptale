// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const {
  loadActiveLedgerMock,
  loggerDebugMock,
  loggerWarnMock,
  sendRuntimeMessageMock,
  upsertLedgerMock,
} = vi.hoisted(() => ({
  loadActiveLedgerMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  upsertLedgerMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    debug: loggerDebugMock,
    warn: loggerWarnMock,
  }),
}));

vi.mock('../../platform/runtime-messaging/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/runtime-messaging/index')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

vi.mock('../../composition/persistence/export-ledger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/export-ledger')>()),
  loadActiveProjectExportJobLedgerEntry: loadActiveLedgerMock,
  upsertProjectExportJobLedgerEntry: upsertLedgerMock,
}));

import { cleanupJob, getSupportedWebmExportMimeType, sendProgress, waitForDelay } from './runtime';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { VideoProjectExportPhase } from '../../features/video/project/types';

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  loadActiveLedgerMock.mockResolvedValue(null);
  upsertLedgerMock.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function createCleanupDisposers() {
  const disconnectSource = vi.fn();
  const disconnectGain = vi.fn();
  const stopAudioTrack = vi.fn();
  const stopVideoTrack = vi.fn();
  const revokeObjectUrl = vi.fn();
  const pauseVideo = vi.fn();
  const closeAudioContext = vi.fn().mockRejectedValue(new Error('close failed'));

  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectUrl);

  return {
    closeAudioContext,
    disconnectGain,
    disconnectSource,
    pauseVideo,
    revokeObjectUrl,
    stopAudioTrack,
    stopVideoTrack,
  };
}

function createCleanupJob() {
  const disposers = createCleanupDisposers();
  const cleanupNode = document.createElement('div');

  return {
    ...disposers,
    job: {
      mediaRecorder: null,
      clipMediaElements: new Map([
        [
          'clip-1',
          {
            pause: disposers.pauseVideo,
            src: 'blob:clip-1',
          } as unknown as HTMLMediaElement,
        ],
      ]),
      clipAudioNodes: new Map([
        [
          'clip-1',
          {
            source: { disconnect: disposers.disconnectSource },
            gain: { disconnect: disposers.disconnectGain },
          },
        ],
      ]),
      audioContext: {
        state: 'running',
        close: disposers.closeAudioContext,
      },
      audioDestination: {
        stream: {
          getTracks: () => [{ stop: disposers.stopAudioTrack }],
        },
      },
      exportAudioSettings: { sampleRate: 48_000, numberOfChannels: 2 },
      assetUrls: ['blob:asset-1'],
      cleanupNode,
      exportAbortController: {
        abort: vi.fn(),
      },
      exportStream: {
        getTracks: () => [{ stop: disposers.stopVideoTrack }],
      },
    },
  };
}

function expectCleanupJobState(cleanup: ReturnType<typeof createCleanupJob>) {
  expect(cleanup.disconnectSource).toHaveBeenCalledOnce();
  expect(cleanup.disconnectGain).toHaveBeenCalledOnce();
  expect(cleanup.stopAudioTrack).toHaveBeenCalledOnce();
  expect(cleanup.stopVideoTrack).toHaveBeenCalledOnce();
  expect(cleanup.pauseVideo).toHaveBeenCalledOnce();
  expect(cleanup.revokeObjectUrl).toHaveBeenCalledWith('blob:asset-1');
  expect(cleanup.job.clipAudioNodes.size).toBe(0);
  expect(cleanup.job.clipMediaElements.size).toBe(0);
  expect(cleanup.job.assetUrls).toEqual([]);
  expect(cleanup.job.cleanupNode).toBeNull();
  expect(cleanup.job.exportAbortController).toBeNull();
  expect(cleanup.job.exportStream).toBeNull();
  expect(cleanup.job.audioContext).toBeNull();
  expect(cleanup.job.audioDestination).toBeNull();
  expect(cleanup.job.exportAudioSettings).toBeNull();
  expect(loggerWarnMock).toHaveBeenCalledWith('Failed to close AudioContext', expect.any(Error));
}

it('chooses the first supported WebM mime type and falls back to plain webm', () => {
  const mediaRecorderMock = {
    isTypeSupported: vi.fn((type: string) => type === 'video/webm;codecs=vp8'),
  };

  vi.stubGlobal('MediaRecorder', mediaRecorderMock);
  expect(getSupportedWebmExportMimeType()).toBe('video/webm;codecs=vp8');

  mediaRecorderMock.isTypeSupported.mockReturnValue(false);
  expect(getSupportedWebmExportMimeType()).toBe('video/webm');
});

it('sends clamped progress updates and logs best-effort transport failures', async () => {
  sendRuntimeMessageMock.mockResolvedValueOnce(undefined);
  loadActiveLedgerMock.mockResolvedValueOnce({ jobId: 'job-1', projectId: 'project-1' });

  await sendProgress('job-1', VideoProjectExportPhase.TRANSCODING, 140, 'working');

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.PROJECT_EXPORT_PROGRESS,
    jobId: 'job-1',
    status: {
      phase: VideoProjectExportPhase.TRANSCODING,
      progress: 100,
      message: 'working',
    },
  });
  expect(upsertLedgerMock).toHaveBeenCalledWith({
    jobId: 'job-1',
    projectId: 'project-1',
    phase: VideoProjectExportPhase.TRANSCODING,
    progress: 100,
  });
  expect(loggerDebugMock).not.toHaveBeenCalled();

  sendRuntimeMessageMock.mockRejectedValueOnce(new Error('offline'));
  await expect(
    sendProgress('job-2', VideoProjectExportPhase.PREPARING, -10, 'retry')
  ).resolves.toBeUndefined();
  await flushPromises();
  expect(loggerDebugMock).toHaveBeenCalledWith(
    'Failed to notify runtime about export progress',
    expect.objectContaining({
      errorMessage: 'offline',
      jobId: 'job-2',
      phase: VideoProjectExportPhase.PREPARING,
    })
  );
});

it('cleans up export runtime resources and logs AudioContext close failures', async () => {
  const cleanup = createCleanupJob();

  cleanupJob(cleanup.job as never);
  await Promise.resolve();

  expectCleanupJobState(cleanup);
});

it('skips optional cleanup branches when runtime resources are already absent or closed', () => {
  const revokeObjectUrl = vi.fn();
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectUrl);

  const job = {
    mediaRecorder: null,
    clipMediaElements: new Map(),
    clipAudioNodes: new Map(),
    audioContext: {
      state: 'closed',
      close: vi.fn(),
    },
    audioDestination: null,
    exportAudioSettings: null,
    assetUrls: [],
    cleanupNode: null,
    exportAbortController: null,
    exportStream: null,
  };

  cleanupJob(job as never);

  expect(job.audioContext).toBeNull();
  expect(job.audioDestination).toBeNull();
  expect(job.exportAbortController).toBeNull();
  expect(job.exportStream).toBeNull();
  expect(revokeObjectUrl).not.toHaveBeenCalled();
  expect(loggerWarnMock).not.toHaveBeenCalled();
});

it('waits for the requested delay and rejects aborted waits', async () => {
  const controller = new AbortController();
  const alreadyAborted = new AbortController();
  alreadyAborted.abort();

  const delayed = waitForDelay(25);
  await vi.advanceTimersByTimeAsync(25);
  await expect(delayed).resolves.toBeUndefined();

  const aborted = waitForDelay(50, controller.signal);
  controller.abort();
  await expect(aborted).rejects.toThrow('The export was aborted.');

  await expect(waitForDelay(0)).resolves.toBeUndefined();
  await expect(waitForDelay(0, alreadyAborted.signal)).rejects.toThrow('The export was aborted.');
});
