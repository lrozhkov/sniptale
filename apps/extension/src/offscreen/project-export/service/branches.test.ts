import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createProjectExportService } from './index';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
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
  sendRuntimeMessageMock,
} = vi.hoisted(() => ({
  cleanupJobMock: vi.fn(),
  sendProgressMock: vi.fn(),
  loadImagesForProjectMock: vi.fn(),
  canUsePassthroughPathMock: vi.fn(),
  exportPassthroughMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  renderCompositeExportMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
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

vi.mock('../../../platform/runtime-messaging/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging/index')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    debug: loggerDebugMock,
    error: loggerErrorMock,
  }),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

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

async function verifiesPassthroughExportPath() {
  const service = createProjectExportService();
  const project = createProject();
  const settings = createExportSettings();

  canUsePassthroughPathMock.mockReturnValue(true);

  await service.startProjectExport('job-1', project, settings);

  expect(exportPassthroughMock).toHaveBeenCalledWith(
    expect.objectContaining({ jobId: 'job-1' }),
    project,
    settings
  );
  expect(loadImagesForProjectMock).not.toHaveBeenCalled();
  expect(renderCompositeExportMock).not.toHaveBeenCalled();
}

async function verifiesCancelledRenderFailurePath() {
  const service = createProjectExportService();
  const project = createProject();
  const settings = createExportSettings();

  renderCompositeExportMock.mockImplementation((jobState) => {
    jobState.cancelled = true;
    return Promise.reject(new Error('cancelled'));
  });

  await expect(service.startProjectExport('job-1', project, settings)).resolves.toBeUndefined();
  await vi.waitFor(() => expect(cleanupJobMock).toHaveBeenCalledTimes(1));

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: 'PROJECT_EXPORT_CANCELLED',
    jobId: 'job-1',
  });
  expect(cleanupJobMock).toHaveBeenCalledTimes(1);
}

async function verifiesCancelledExportFailureTrace() {
  const service = createProjectExportService();
  const project = createProject();
  const settings = createExportSettings();

  renderCompositeExportMock.mockImplementation((jobState) => {
    jobState.cancelled = true;
    return Promise.reject(new Error('cancelled'));
  });
  sendRuntimeMessageMock.mockRejectedValueOnce(new Error('popup closed'));

  await expect(service.startProjectExport('job-2', project, settings)).resolves.toBeUndefined();
  await vi.waitFor(() => expect(loggerDebugMock).toHaveBeenCalledTimes(1));

  expect(loggerDebugMock).toHaveBeenCalledWith(
    'Failed to notify runtime about cancelled project export',
    expect.objectContaining({
      errorMessage: 'popup closed',
      jobId: 'job-2',
    })
  );
}

async function verifiesFailedRenderFailurePath() {
  const service = createProjectExportService();
  const project = createProject();
  const settings = createExportSettings();

  renderCompositeExportMock.mockRejectedValue(new Error('render failed'));

  await expect(service.startProjectExport('job-1', project, settings)).resolves.toBeUndefined();
  await vi.waitFor(() => expect(cleanupJobMock).toHaveBeenCalledTimes(1));

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: 'PROJECT_EXPORT_FAILED',
    jobId: 'job-1',
    error: 'render failed',
  });
  expect(cleanupJobMock).toHaveBeenCalledTimes(1);
}

async function verifiesFailedExportFailureTrace() {
  const service = createProjectExportService();
  const project = createProject();
  const settings = createExportSettings();

  renderCompositeExportMock.mockRejectedValue(new Error('render failed again'));
  sendRuntimeMessageMock.mockRejectedValueOnce(new Error('popup gone'));

  await expect(service.startProjectExport('job-3', project, settings)).resolves.toBeUndefined();
  await vi.waitFor(() => expect(loggerDebugMock).toHaveBeenCalledTimes(1));

  expect(loggerErrorMock).toHaveBeenCalledWith('Failed', expect.any(Error));
  expect(loggerDebugMock).toHaveBeenCalledWith(
    'Failed to notify runtime about failed project export',
    expect.objectContaining({
      errorMessage: 'popup gone',
      jobId: 'job-3',
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sendProgressMock.mockResolvedValue(undefined);
  loadImagesForProjectMock.mockResolvedValue(new Map());
  canUsePassthroughPathMock.mockReturnValue(false);
  exportPassthroughMock.mockResolvedValue(undefined);
  sendRuntimeMessageMock.mockResolvedValue(undefined);
});

describe('project-export service ownership branches', () => {
  it('uses the passthrough export path when the project qualifies', verifiesPassthroughExportPath);
  it(
    'reports cancelled render failures through the cancelled runtime message path',
    verifiesCancelledRenderFailurePath
  );
  it(
    'logs cancelled-export notification failures without throwing',
    verifiesCancelledExportFailureTrace
  );
  it(
    'reports uncancelled render failures through the failed runtime message path',
    verifiesFailedRenderFailurePath
  );
  it(
    'logs failed-export notification failures without hiding the primary render error',
    verifiesFailedExportFailureTrace
  );
});
