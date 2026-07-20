// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { VideoProjectAssetType } from '../../../features/video/project/types';
import { loadInitialProjectFromLocation, openPersistedProject } from './workspace';
import { createPersistedLegacyRecordingProject } from './workspace.test-support';

const {
  autoTransformRecordingProjectMock,
  deleteProjectAsset,
  getRecording,
  getRecordingTelemetry,
  getVideoProject,
  importRecordingProjectAssetMock,
  saveVideoProject,
} = vi.hoisted(() => ({
  autoTransformRecordingProjectMock: vi.fn(),
  deleteProjectAsset: vi.fn(),
  getRecording: vi.fn(),
  getRecordingTelemetry: vi.fn(),
  getVideoProject: vi.fn(),
  importRecordingProjectAssetMock: vi.fn(),
  saveVideoProject: vi.fn(),
}));

vi.mock('../../../composition/persistence/projects/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/projects/index')>()),
  deleteProjectAsset,
  getVideoProject,
}));

vi.mock('../../../composition/persistence/projects/index-mutations', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/projects/index-mutations')
  >()),
  commitVideoProjectMutation: saveVideoProject,
}));

vi.mock('../../../composition/persistence/recordings/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/recordings/index')>()),
  getRecording,
}));

vi.mock('../../../composition/persistence/recordings/telemetry', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/recordings/telemetry')
  >()),
  getRecordingTelemetry,
}));

vi.mock('../media-metadata', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../media-metadata')>();
  return {
    ...actual,
    loadVideoMetadata: vi.fn(),
  };
});

vi.mock('./assets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./assets')>();
  return {
    ...actual,
    importRecordingProjectAsset: importRecordingProjectAssetMock,
  };
});

vi.mock('./auto-transform', () => ({
  autoTransformRecordingProject: autoTransformRecordingProjectMock,
}));

async function mockRecordingProjectLoad() {
  const recordingEntry = {
    blob: new Blob(['video'], { type: 'video/webm' }),
    createdAt: 1,
    filename: 'recording.webm',
    id: 'recording-1',
    size: 5,
  };
  getRecording.mockImplementation((recordingId: string) =>
    Promise.resolve(recordingId === 'recording-1' ? recordingEntry : undefined)
  );
  getRecordingTelemetry.mockResolvedValue({
    recordingId: 'recording-1',
    createdAt: 1,
    updatedAt: 2,
    captureMode: 'TAB',
    viewport: null,
    cursorTrack: {
      captureMode: 'separate',
      samples: [{ id: 'sample-1', time: 0.5, x: 100, y: 120, visible: true }],
      skin: {
        animationPreset: 'NONE',
        color: '#ff7a1a',
        hidden: false,
        preset: 'ARROW',
        scale: 1,
        shadow: true,
      },
    },
    actionEvents: [],
  });
  mockImportedRecordingAsset();
  const { loadVideoMetadata } = await import('../media-metadata');
  vi.mocked(loadVideoMetadata).mockResolvedValue({
    audioPeaks: null,
    duration: 5,
    hasAudio: false,
    height: 720,
    mimeType: 'video/webm',
    size: 5,
    width: 1280,
  });
}

function mockImportedRecordingAsset() {
  importRecordingProjectAssetMock.mockResolvedValue({
    id: 'asset-1',
    type: VideoProjectAssetType.RECORDING,
    name: 'recording.webm',
    source: {
      kind: 'project-asset',
      projectAssetId: 'project-asset-1',
      originRecordingId: 'recording-1',
    },
    metadata: {
      width: 1280,
      height: 720,
      duration: 5,
      mimeType: 'video/webm',
      size: 5,
      hasAudio: false,
      audioPeaks: null,
    },
    createdAt: 1,
  });
}

describe('loadInitialProjectFromLocation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.history.replaceState({}, '', '/video-editor.html');
  });

  it('fails for a missing explicit project', verifyMissingProject);
  it('creates a blank project without an explicit target', verifyBlankProjectCreation);
  it('hydrates cursor telemetry from a recording', verifyRecordingHydration);
  it('rolls back the imported asset when project persistence fails', verifyRecordingAssetRollback);
  it('leaves plain recordings without cursor telemetry', verifyPlainRecordingHydration);
  it('migrates persisted legacy recording assets', verifyPersistedRecordingMigration);
  it('rolls back failed persisted project migration', verifyPersistedRecordingMigrationRollback);
  it('routes explicit project query loads through migration', verifyProjectQueryMigrationPath);
  it('rejects malformed persisted projects before migration', verifyMalformedPersistedProject);
});

async function verifyMissingProject() {
  getVideoProject.mockResolvedValue({ status: 'notFound' });
  window.history.replaceState({}, '', '/video-editor.html?project=missing-project');
  const expectedMessage =
    `${translate('videoEditor.app.projectNotFoundPrefix')}missing-project` +
    translate('videoEditor.app.projectNotFoundSuffix');

  await expect(loadInitialProjectFromLocation()).rejects.toThrow(expectedMessage);
  expect(saveVideoProject).not.toHaveBeenCalled();
}

async function verifyBlankProjectCreation() {
  const blankProject = createEmptyVideoProject('Blank');

  vi.spyOn(Date, 'now').mockReturnValue(blankProject.createdAt);
  getVideoProject.mockResolvedValue({ status: 'notFound' });
  saveVideoProject.mockResolvedValue(undefined);

  const result = await loadInitialProjectFromLocation();

  expect(result.project.id).toBeTruthy();
  expect(saveVideoProject).toHaveBeenCalledTimes(1);
}

async function verifyRecordingHydration() {
  await mockRecordingProjectLoad();
  window.history.replaceState({}, '', '/video-editor.html?id=recording-1');

  const result = await loadInitialProjectFromLocation();

  expect(result.project.cursorTrack?.captureMode).toBe('separate');
  expect(result.project.cursorTrack?.samples[0]?.id).toBe('sample-1');
  expect(result.project.assets[0]?.source).toEqual({
    kind: 'project-asset',
    projectAssetId: 'project-asset-1',
    originRecordingId: 'recording-1',
  });
  expect(autoTransformRecordingProjectMock).not.toHaveBeenCalled();
}

async function verifyRecordingAssetRollback() {
  await mockRecordingProjectLoad();
  saveVideoProject.mockRejectedValue(new Error('persist failed'));
  window.history.replaceState({}, '', '/video-editor.html?id=recording-1');

  await expect(loadInitialProjectFromLocation()).rejects.toThrow('persist failed');
  expect(deleteProjectAsset).toHaveBeenCalledWith('project-asset-1');
}

async function verifyPlainRecordingHydration() {
  await mockRecordingProjectLoad();
  getRecordingTelemetry.mockResolvedValue(undefined);
  window.history.replaceState({}, '', '/video-editor.html?id=recording-1');

  const result = await loadInitialProjectFromLocation();

  expect(result.project.source).toEqual({
    kind: 'recording',
    recordingId: 'recording-1',
  });
  expect(result.project.cursorTrack).toBeNull();
  expect(result.project.actionEvents).toEqual([]);
}

async function verifyPersistedRecordingMigration() {
  const persistedProject = createPersistedLegacyRecordingProject();
  getVideoProject.mockResolvedValue({ project: persistedProject, status: 'ready' });
  mockImportedRecordingAsset();
  saveVideoProject.mockResolvedValue(undefined);

  const project = await openPersistedProject('project-1');

  expect(importRecordingProjectAssetMock).toHaveBeenCalledWith('recording-1');
  expect(project.assets[0]?.source).toEqual({
    kind: 'project-asset',
    projectAssetId: 'project-asset-1',
    originRecordingId: 'recording-1',
  });
  expect(project.assets[0]?.id).toBeTruthy();
  expect(saveVideoProject).toHaveBeenCalledWith(
    expect.objectContaining({
      id: project.id,
      assets: [
        expect.objectContaining({
          source: {
            kind: 'project-asset',
            projectAssetId: 'project-asset-1',
            originRecordingId: 'recording-1',
          },
        }),
      ],
    }),
    { baseRevision: persistedProject.updatedAt }
  );
}

async function verifyPersistedRecordingMigrationRollback() {
  getVideoProject.mockResolvedValue({
    project: createPersistedLegacyRecordingProject(),
    status: 'ready',
  });
  mockImportedRecordingAsset();
  saveVideoProject.mockRejectedValue(new Error('persist failed'));

  await expect(openPersistedProject('project-1')).rejects.toThrow('persist failed');
  expect(deleteProjectAsset).toHaveBeenCalledWith('project-asset-1');
}

async function verifyMalformedPersistedProject() {
  getVideoProject.mockResolvedValue({
    diagnostics: ['invalid-video-project-entry'],
    opaqueId: 'project-1',
    status: 'invalid',
  });

  await expect(openPersistedProject('project-1')).rejects.toMatchObject({
    code: 'invalid-video-project',
  });
  expect(importRecordingProjectAssetMock).not.toHaveBeenCalled();
  expect(saveVideoProject).not.toHaveBeenCalled();
}

async function verifyProjectQueryMigrationPath() {
  getVideoProject.mockResolvedValue({
    project: createPersistedLegacyRecordingProject(),
    status: 'ready',
  });
  mockImportedRecordingAsset();
  saveVideoProject.mockResolvedValue(undefined);
  window.history.replaceState({}, '', '/video-editor.html?project=project-1');

  const result = await loadInitialProjectFromLocation();

  expect(importRecordingProjectAssetMock).toHaveBeenCalledWith('recording-1');
  expect(result.project.assets[0]?.source).toEqual({
    kind: 'project-asset',
    projectAssetId: 'project-asset-1',
    originRecordingId: 'recording-1',
  });
}
