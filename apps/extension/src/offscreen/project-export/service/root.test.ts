import { beforeEach, expect, it, vi } from 'vitest';

import { createProjectExportService } from './index';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoProjectExportPhase,
  VideoSceneBackgroundKind,
  VideoTimelinePlacementMode,
  type VideoProject,
  type VideoProjectExportSettings,
} from '../../../features/video/project/types';

const {
  cleanupJobMock,
  sendProgressMock,
  loadImagesForProjectMock,
  canUsePassthroughPathMock,
  exportPassthroughMock,
  loggerDebugMock,
  loggerErrorMock,
  renderCompositeExportMock,
  sendRuntimeMessageBestEffortMock,
  loadActiveLedgerMock,
  markTerminalMock,
  requestCancelMock,
  upsertLedgerMock,
} = vi.hoisted(() => ({
  cleanupJobMock: vi.fn(),
  sendProgressMock: vi.fn(),
  loadImagesForProjectMock: vi.fn(),
  canUsePassthroughPathMock: vi.fn(),
  exportPassthroughMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  renderCompositeExportMock: vi.fn(),
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
  canUsePassthroughPath: canUsePassthroughPathMock,
  exportPassthrough: exportPassthroughMock,
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

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    debug: loggerDebugMock,
    error: loggerErrorMock,
  }),
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
    quality: VideoExportQualityPreset.BALANCED,
    format: VideoExportFormat.MP4,
    downloadAfterExport: true,
  };
}

function createMalformedVisibleTrackProject(): VideoProject {
  return JSON.parse(
    JSON.stringify({
      ...createProject(),
      tracks: [
        {
          id: 'track-1',
          kind: 'PRIMARY',
          locked: false,
          name: 'Track',
          order: 0,
          visible: 'yes',
        },
      ],
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sendProgressMock.mockResolvedValue(undefined);
  loadImagesForProjectMock.mockResolvedValue(new Map());
  canUsePassthroughPathMock.mockReturnValue(false);
  exportPassthroughMock.mockResolvedValue(undefined);
  sendRuntimeMessageBestEffortMock.mockReturnValue(undefined);
  loadActiveLedgerMock.mockResolvedValue(null);
  markTerminalMock.mockResolvedValue(null);
  requestCancelMock.mockResolvedValue(null);
  upsertLedgerMock.mockImplementation((input: unknown) => Promise.resolve(input));
});

it('accepts duplicate starts for the same job id while that export is active', async () => {
  const service = createProjectExportService();
  const project = createProject();
  const settings = createExportSettings();
  let finishRender: (() => void) | null = null;

  renderCompositeExportMock.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finishRender = resolve;
      })
  );

  const firstStart = service.startProjectExport('job-1', project, settings);

  await expect(service.startProjectExport('job-1', project, settings)).resolves.toBeUndefined();
  expect(renderCompositeExportMock).toHaveBeenCalledTimes(1);

  resolvePendingRender(finishRender);
  await firstStart;
  await flushPromises();

  expect(sendProgressMock).toHaveBeenCalledWith(
    'job-1',
    VideoProjectExportPhase.PREPARING,
    0,
    'offscreenExport.preparingProject'
  );
  expect(cleanupJobMock).toHaveBeenCalledTimes(1);
  expect(upsertLedgerMock).toHaveBeenCalledWith({
    jobId: 'job-1',
    projectId: 'project-1',
  });
});

it('rejects malformed projects before export lifecycle side effects', async () => {
  const service = createProjectExportService();
  const settings = createExportSettings();
  const malformedProject = createMalformedVisibleTrackProject();

  await expect(service.startProjectExport('job-1', malformedProject, settings)).rejects.toThrow(
    'Invalid video project payload'
  );

  expect(loadActiveLedgerMock).not.toHaveBeenCalled();
  expect(upsertLedgerMock).not.toHaveBeenCalled();
  expect(sendProgressMock).not.toHaveBeenCalled();
  expect(renderCompositeExportMock).not.toHaveBeenCalled();
});

it('rejects missing scene background image assets before export lifecycle side effects', async () => {
  const service = createProjectExportService();
  const settings = createExportSettings();
  const project = {
    ...createProject(),
    sceneBackground: { assetId: 'missing-background', kind: VideoSceneBackgroundKind.IMAGE },
  };

  await expect(service.startProjectExport('job-1', project, settings)).rejects.toThrow(
    'Invalid video project payload'
  );

  expect(loadActiveLedgerMock).not.toHaveBeenCalled();
  expect(upsertLedgerMock).not.toHaveBeenCalled();
  expect(sendProgressMock).not.toHaveBeenCalled();
  expect(renderCompositeExportMock).not.toHaveBeenCalled();
});

it('rejects different job ids while an export is active', async () => {
  const service = createProjectExportService();
  const project = createProject();
  const settings = createExportSettings();
  let finishRender: (() => void) | null = null;

  renderCompositeExportMock.mockImplementation(() => {
    return new Promise<void>((resolve) => {
      finishRender = resolve;
    });
  });

  const firstStart = service.startProjectExport('job-1', project, settings);

  await flushPromises();
  await expect(service.startProjectExport('job-2', project, settings)).rejects.toThrow(
    'offscreenExport.alreadyRunning'
  );
  expect(renderCompositeExportMock).toHaveBeenCalledTimes(1);

  resolvePendingRender(finishRender);
  await firstStart;
  await flushPromises();

  expect(cleanupJobMock).toHaveBeenCalledTimes(1);
});

it('releases the active admission slot after a failed export', async () => {
  const service = createProjectExportService();
  const project = createProject();
  const settings = createExportSettings();

  renderCompositeExportMock.mockRejectedValueOnce(new Error('render failed'));
  await service.startProjectExport('job-1', project, settings);
  await flushPromises();

  renderCompositeExportMock.mockResolvedValueOnce(undefined);
  await expect(service.startProjectExport('job-2', project, settings)).resolves.toBeUndefined();

  expect(renderCompositeExportMock).toHaveBeenCalledTimes(2);
});

it('preserves the matching running ledger during the admitted start handoff', async () => {
  loadActiveLedgerMock.mockResolvedValueOnce({ jobId: 'job-handoff', status: 'running' });
  const service = createProjectExportService();

  await service.startProjectExport('job-handoff', createProject(), createExportSettings());
  await flushPromises();

  expect(markTerminalMock).not.toHaveBeenCalled();
  expect(upsertLedgerMock).toHaveBeenCalledWith({
    jobId: 'job-handoff',
    projectId: 'project-1',
  });
});
