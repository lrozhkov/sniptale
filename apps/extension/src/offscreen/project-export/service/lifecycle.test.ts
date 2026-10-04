import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createProjectExportService } from './index';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoProjectExportPhase,
  VideoTimelinePlacementMode,
  type VideoProject,
  type VideoProjectExportSettings,
} from '../../../features/video/project/types';

const {
  cleanupJobMock,
  loadImagesForProjectMock,
  renderCompositeExportMock,
  sendProgressMock,
  sendRuntimeMessageBestEffortMock,
  loadActiveLedgerMock,
  markTerminalMock,
  requestCancelMock,
  upsertLedgerMock,
} = vi.hoisted(() => ({
  cleanupJobMock: vi.fn(),
  loadImagesForProjectMock: vi.fn(),
  renderCompositeExportMock: vi.fn(),
  sendProgressMock: vi.fn(),
  sendRuntimeMessageBestEffortMock: vi.fn(),
  loadActiveLedgerMock: vi.fn(),
  markTerminalMock: vi.fn(),
  requestCancelMock: vi.fn(),
  upsertLedgerMock: vi.fn(),
}));

vi.mock('../runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime')>()),
  cleanupJob: cleanupJobMock,
  sendProgress: sendProgressMock,
}));

vi.mock('../media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../media')>()),
  loadImagesForProject: loadImagesForProjectMock,
}));

vi.mock('../render', () => ({
  renderCompositeExport: renderCompositeExportMock,
}));

vi.mock('../../runtime-messaging/best-effort', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime-messaging/best-effort')>()),
  sendRuntimeMessageBestEffort: sendRuntimeMessageBestEffortMock,
}));

vi.mock('../../../composition/persistence/export-ledger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/export-ledger')>()),
  loadActiveProjectExportJobLedgerEntry: loadActiveLedgerMock,
  markProjectExportJobTerminal: markTerminalMock,
  requestProjectExportJobCancel: requestCancelMock,
  upsertProjectExportJobLedgerEntry: upsertLedgerMock,
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

function resolvePendingRender(resolve: (() => void) | null): void {
  resolve?.();
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function createProject(): VideoProject {
  return {
    version: 2,
    id: 'project-1',
    name: 'Project',
    source: { kind: 'manual' },
    baseRecordingId: null,
    width: 1280,
    height: 720,
    fps: 30,
    backgroundColor: '#000000',
    timelinePlacementMode: VideoTimelinePlacementMode.ALLOW_OVERLAP,
    duration: 10,
    createdAt: 1,
    updatedAt: 1,
    assets: [],
    tracks: [],
    clips: [],
    cursorTrack: null,
    actionEvents: [],
  };
}

function createExportSettings(): VideoProjectExportSettings {
  return {
    width: 1280,
    height: 720,
    fps: 30,
    quality: VideoExportQualityPreset.MEDIUM,
    format: VideoExportFormat.MP4,
    resolution: 'SOURCE' as const,
    mp4VideoCodec: 'AVC' as const,
    downloadAfterExport: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sendProgressMock.mockResolvedValue(undefined);
  loadImagesForProjectMock.mockResolvedValue(new Map());
  sendRuntimeMessageBestEffortMock.mockReturnValue(undefined);
  loadActiveLedgerMock.mockResolvedValue(null);
  markTerminalMock.mockResolvedValue(null);
  requestCancelMock.mockResolvedValue(null);
  upsertLedgerMock.mockImplementation((input: { jobId: string; projectId: string }) =>
    Promise.resolve({ ...input, status: 'running', cancelRequested: false })
  );
});

function expectPreloadSignal(preloadSignal: AbortSignal | null, aborted: boolean): void {
  expect(preloadSignal).not.toBeNull();
  expect((preloadSignal as AbortSignal).aborted).toBe(aborted);
}

function createAbortableExportController(abortMock: () => void): AbortController {
  const controller = new AbortController();
  vi.spyOn(controller, 'abort').mockImplementation(abortMock);
  return controller;
}

function createStoppableExportStream(stopTrackMock: () => void): MediaStream {
  return {
    getTracks: () => [{ stop: stopTrackMock } as MediaStreamTrack],
  } as MediaStream;
}

function createRecordingMediaRecorder(stopRecorderMock: () => void): MediaRecorder {
  return {
    state: 'recording',
    stop: stopRecorderMock,
  } as MediaRecorder;
}

async function verifyActiveExportCancellation(): Promise<void> {
  const service = createProjectExportService();
  const project = createProject();
  const settings = createExportSettings();
  const abortMock = vi.fn();
  const stopTrackMock = vi.fn();
  const stopRecorderMock = vi.fn();
  let finishRender: (() => void) | null = null;

  renderCompositeExportMock.mockImplementation((jobState) => {
    jobState.exportAbortController = createAbortableExportController(abortMock);
    jobState.exportStream = createStoppableExportStream(stopTrackMock);
    jobState.mediaRecorder = createRecordingMediaRecorder(stopRecorderMock);

    return new Promise<void>((resolve) => {
      finishRender = resolve;
    });
  });

  let startAccepted = false;
  const startPromise = service.startProjectExport('job-1', project, settings).then(() => {
    startAccepted = true;
  });
  await vi.waitFor(() => expect(renderCompositeExportMock).toHaveBeenCalledOnce());
  expect(finishRender).not.toBeNull();
  expect(startAccepted).toBe(true);

  await service.cancelProjectExport('job-1');
  resolvePendingRender(finishRender);
  await startPromise;
  await flushPromises();

  expect(requestCancelMock).toHaveBeenCalledWith('job-1');
  expect(abortMock).toHaveBeenCalledOnce();
  expect(stopTrackMock).toHaveBeenCalledOnce();
  expect(stopRecorderMock).toHaveBeenCalledOnce();
  expect(cleanupJobMock).toHaveBeenCalledTimes(1);
}

async function verifyPreloadCancellationCleanup(): Promise<void> {
  const service = createProjectExportService();
  const project = createProject();
  const settings = createExportSettings();
  let preloadSignal: AbortSignal | null = null;

  loadImagesForProjectMock.mockImplementation((_project, _job, signal: AbortSignal) => {
    preloadSignal = signal;
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('PROJECT_EXPORT_CANCELLED')), {
        once: true,
      });
    });
  });

  const startPromise = service.startProjectExport('job-preload', project, settings);
  await vi.waitFor(() => expectPreloadSignal(preloadSignal, false));

  await service.cancelProjectExport('job-preload');
  await startPromise;
  await flushPromises();

  expectPreloadSignal(preloadSignal, true);
  expect(requestCancelMock).toHaveBeenCalledWith('job-preload');
  expect(cleanupJobMock).toHaveBeenCalledTimes(1);
  expect(sendRuntimeMessageBestEffortMock).toHaveBeenCalledWith(
    expect.objectContaining({
      payload: expect.objectContaining({
        jobId: 'job-preload',
        type: 'PROJECT_EXPORT_CANCELLED',
      }),
    })
  );
}

describe('project-export service cancellation', () => {
  it('cancels the active export job through the owned job state', verifyActiveExportCancellation);
  it(
    'cancels pending image preload and still releases resources',
    verifyPreloadCancellationCleanup
  );
});

describe('project-export service inactive cancellation', () => {
  it('marks a known inactive export job as cancelled without throwing', async () => {
    const service = createProjectExportService();

    requestCancelMock.mockResolvedValueOnce({
      jobId: 'job-9',
      projectId: 'project-1',
      status: 'running',
    });

    await expect(service.cancelProjectExport('job-9')).resolves.toBeUndefined();

    expect(markTerminalMock).toHaveBeenCalledWith('job-9', 'cancelled');
  });
});

describe('project-export service ledger reconciliation', () => {
  it('fails an active ledger job when no offscreen export is active', async () => {
    const service = createProjectExportService();

    loadActiveLedgerMock.mockResolvedValueOnce({
      jobId: 'job-stale',
      projectId: 'project-1',
      phase: VideoProjectExportPhase.PREPARING,
      progress: 20,
      status: 'running',
      startedAt: 1,
      updatedAt: 2,
      cancelRequested: false,
      terminalError: null,
    });

    await service.reconcileProjectExportJobs();

    expect(markTerminalMock).toHaveBeenCalledWith(
      'job-stale',
      'failed',
      'offscreenExport.interruptedByRuntimeRestart'
    );
    expect(sendRuntimeMessageBestEffortMock).toHaveBeenCalledWith({
      context: { jobId: 'job-stale' },
      logger: expect.any(Object),
      logMessage: 'Failed to notify runtime about failed project export',
      payload: {
        type: 'PROJECT_EXPORT_FAILED',
        jobId: 'job-stale',
        error: 'offscreenExport.interruptedByRuntimeRestart',
      },
    });
  });
});

it('cancels pending data preparation without consuming the input or starting a late export', async () => {
  const service = createProjectExportService();
  let resolve!: () => void;
  const data = new Promise<void>((done) => {
    resolve = done;
  });
  const input = vi.fn(async () => createProject());
  const pending = service.startProjectExport(
    'job-pending',
    input,
    createExportSettings(),
    () => data
  );
  await service.cancelProjectExport('job-pending');
  await pending;
  resolve();
  await flushPromises();
  expect(input).not.toHaveBeenCalled();
  expect(renderCompositeExportMock).not.toHaveBeenCalled();
  expect(requestCancelMock).toHaveBeenCalledWith('job-pending');
});

it('does not restart a terminal job returned by atomic ledger admission', async () => {
  const service = createProjectExportService();
  upsertLedgerMock.mockResolvedValueOnce({ status: 'cancelled', cancelRequested: true });
  await service.startProjectExport('job-terminal', createProject(), createExportSettings());
  expect(renderCompositeExportMock).not.toHaveBeenCalled();
});

it.each([false, true])(
  'cancels during input consumption even when cancel persistence fails: %s',
  async (failCancel) => {
    const service = createProjectExportService();
    let resolveInput!: (project: VideoProject) => void;
    const input = vi.fn(
      () =>
        new Promise<VideoProject>((resolve) => {
          resolveInput = resolve;
        })
    );
    const pending = service.startProjectExport('job-old', input, createExportSettings());
    await vi.waitFor(() => expect(input).toHaveBeenCalledOnce());
    if (failCancel) requestCancelMock.mockRejectedValueOnce(new Error('session unavailable'));
    const cancel = service.cancelProjectExport('job-old');
    if (failCancel) await expect(cancel).rejects.toThrow('session unavailable');
    else await cancel;
    await pending;
    const nextInput = vi.fn(async () => createProject());
    const next = service.startProjectExport(
      'job-new',
      nextInput,
      createExportSettings(),
      () => new Promise(() => undefined)
    );
    resolveInput(createProject());
    await flushPromises();
    await expect(
      service.startProjectExport('job-third', createProject(), createExportSettings())
    ).rejects.toThrow('alreadyRunning');
    expect(renderCompositeExportMock).not.toHaveBeenCalled();
    expect(nextInput).not.toHaveBeenCalled();
    await service.cancelProjectExport('job-new');
    await next;
    expect(cleanupJobMock).toHaveBeenCalledTimes(2);
  }
);

it('cancels during ledger admission without launching the accepted renderer', async () => {
  const service = createProjectExportService();
  let admit!: (entry: { status: string; cancelRequested: boolean }) => void;
  upsertLedgerMock.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        admit = resolve;
      })
  );
  const start = service.startProjectExport('job-ledger', createProject(), createExportSettings());
  await vi.waitFor(() => expect(upsertLedgerMock).toHaveBeenCalledOnce());
  await service.cancelProjectExport('job-ledger');
  admit({ status: 'running', cancelRequested: false });
  await start;
  expect(renderCompositeExportMock).not.toHaveBeenCalled();
});
