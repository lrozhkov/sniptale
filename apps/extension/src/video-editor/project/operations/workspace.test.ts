// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { VideoProjectAssetType } from '../../../features/video/project/types';
import { copyProject, loadInitialProjectFromLocation, openPersistedProject } from './workspace';
import { createPersistedLegacyRecordingProject } from './workspace.test-support';

const {
  deleteProjectAsset,
  getRecording,
  getRecordingTelemetry,
  readVideoWorkspace,
  getVideoProject,
  importRecordingProjectAssetMock,
  saveVideoProject,
} = vi.hoisted(() => ({
  deleteProjectAsset: vi.fn(),
  getRecording: vi.fn(),
  getRecordingTelemetry: vi.fn(),
  readVideoWorkspace: vi.fn(),
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

vi.mock('../../../composition/persistence/review-workspaces/store', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/review-workspaces/store')
  >()),
  readVideoWorkspace,
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
    ensureRecordingAssets: async (_project: unknown, recordingId: string) => [
      await importRecordingProjectAssetMock(recordingId),
    ],
  };
});

async function mockRecordingProjectLoad() {
  const recordingEntry = {
    assetId: 'recording-body',
    file: new Blob(['video'], { type: 'video/webm' }),
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
      kind: 'recording',
      recordingId: 'recording-1',
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
    readVideoWorkspace.mockResolvedValue(null);
    saveVideoProject.mockImplementation(async (project) => ({
      ...project,
      updatedAt: project.updatedAt + 1,
    }));
    window.history.replaceState({}, '', '/video-editor.html');
  });

  it('fails for a missing explicit project', verifyMissingProject);
  it('stays idle without an explicit target', verifyBlankProjectCreation);
  it('hydrates cursor telemetry from a recording', verifyRecordingHydration);
  it(
    'preserves the shared recording when project persistence fails',
    verifyRecordingPersistenceFailure
  );
  it('leaves plain recordings without cursor telemetry', verifyPlainRecordingHydration);
  it(
    'opens persisted recording references without copying or rewriting',
    verifyPersistedRecordingReferences
  );
  it(
    'opens persisted recording references even when their source is unavailable',
    verifyUnavailablePersistedRecording
  );
  it('rejects a project moved to trash after the start list was read', verifyTrashedProject);
  it(
    'preserves recording references on explicit project query loads',
    verifyProjectQueryReferencePath
  );
  it('rejects malformed persisted projects before opening', verifyMalformedPersistedProject);
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
  const result = await loadInitialProjectFromLocation();

  expect(result).toEqual({ project: null, recordingId: null });
  expect(saveVideoProject).not.toHaveBeenCalled();
}

async function verifyRecordingHydration() {
  await mockRecordingProjectLoad();
  window.history.replaceState({}, '', '/video-editor.html?id=recording-1');

  const result = await loadInitialProjectFromLocation();

  expect(result.project!.cursorTrack?.captureMode).toBe('separate');
  expect(result.project!.cursorTrack?.samples[0]?.id).toBe('sample-1');
  expect(result.project!.assets[0]?.source).toEqual({
    kind: 'recording',
    recordingId: 'recording-1',
  });
  const { loadVideoMetadata } = await import('../media-metadata');
  expect(loadVideoMetadata).not.toHaveBeenCalled();
}

async function verifyRecordingPersistenceFailure() {
  await mockRecordingProjectLoad();
  saveVideoProject.mockRejectedValue(new Error('persist failed'));
  window.history.replaceState({}, '', '/video-editor.html?id=recording-1');

  await expect(loadInitialProjectFromLocation()).rejects.toThrow('persist failed');
  expect(deleteProjectAsset).not.toHaveBeenCalled();
}

async function verifyPlainRecordingHydration() {
  await mockRecordingProjectLoad();
  getRecordingTelemetry.mockResolvedValue(undefined);
  window.history.replaceState({}, '', '/video-editor.html?id=recording-1');

  const result = await loadInitialProjectFromLocation();

  expect(result.project!.source).toEqual({
    kind: 'recording',
    recordingId: 'recording-1',
  });
  expect(result.project!.cursorTrack).toBeNull();
  expect(result.project!.actionEvents).toEqual([]);
}

async function verifyPersistedRecordingReferences() {
  const persistedProject = createPersistedLegacyRecordingProject();
  getVideoProject.mockResolvedValue({ project: persistedProject, status: 'ready' });
  mockImportedRecordingAsset();

  const project = await openPersistedProject('project-1');

  expect(importRecordingProjectAssetMock).not.toHaveBeenCalled();
  expect(project.assets).toEqual(persistedProject.assets);
  expect(saveVideoProject).not.toHaveBeenCalled();
}

async function verifyUnavailablePersistedRecording() {
  getVideoProject.mockResolvedValue({
    project: createPersistedLegacyRecordingProject(),
    status: 'ready',
  });
  getRecording.mockResolvedValue(undefined);
  importRecordingProjectAssetMock.mockRejectedValue(new Error('Missing source'));
  const project = await openPersistedProject('project-1');
  expect(project.assets[0]?.source).toEqual({ kind: 'recording', recordingId: 'recording-1' });
  expect(importRecordingProjectAssetMock).not.toHaveBeenCalled();
  expect(saveVideoProject).not.toHaveBeenCalled();
  expect(deleteProjectAsset).not.toHaveBeenCalled();
}

async function verifyTrashedProject() {
  getVideoProject.mockResolvedValue({
    project: createPersistedLegacyRecordingProject(),
    status: 'ready',
    lifecycle: { trashedAt: 500 },
  });
  await expect(openPersistedProject('project-1')).rejects.toThrow('unavailable');
  expect(saveVideoProject).not.toHaveBeenCalled();
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

async function verifyProjectQueryReferencePath() {
  getVideoProject.mockResolvedValue({
    project: createPersistedLegacyRecordingProject(),
    status: 'ready',
  });
  mockImportedRecordingAsset();
  window.history.replaceState({}, '', '/video-editor.html?project=project-1');

  const result = await loadInitialProjectFromLocation();

  expect(importRecordingProjectAssetMock).not.toHaveBeenCalled();
  expect(result.project!.assets[0]?.source).toEqual({
    kind: 'recording',
    recordingId: 'recording-1',
  });
}

it('retains an existing temporary project before presenting it for editing', async () => {
  const project = createEmptyVideoProject();
  getVideoProject.mockResolvedValue({
    status: 'ready',
    project,
    workspaceRevision: 4,
    lifecycle: { storageClass: 'temporary', savedAt: null, updatedAt: project.updatedAt },
  });
  saveVideoProject.mockResolvedValue(project);
  await expect(openPersistedProject(project.id)).resolves.toEqual(project);
  expect(saveVideoProject).toHaveBeenCalledWith(project, {
    baseRevision: project.updatedAt,
    expectedWorkspaceRevision: 4,
  });
});

it('does not open a temporary project as saved when library retention fails', async () => {
  const project = createEmptyVideoProject();
  getVideoProject.mockResolvedValue({
    status: 'ready',
    project,
    workspaceRevision: 4,
    lifecycle: { storageClass: 'temporary', savedAt: null, updatedAt: project.updatedAt },
  });
  saveVideoProject.mockRejectedValue(new Error('Storage unavailable'));
  await expect(openPersistedProject(project.id)).rejects.toThrow('Storage unavailable');
});

it('duplicates the whole editable document without sharing mutable state', async () => {
  const original = createEmptyVideoProject('Original');
  saveVideoProject.mockImplementation(async (project) => project);
  const copy = await copyProject(original, 'Copy');
  expect(copy).toEqual({
    ...original,
    id: copy.id,
    name: 'Copy',
    createdAt: copy.createdAt,
    updatedAt: copy.updatedAt,
  });
  expect(copy.id).not.toBe(original.id);
  expect(copy.tracks).not.toBe(original.tracks);
  expect(copy.tracks[0]).not.toBe(original.tracks[0]);
  copy.tracks[0]!.name = 'Changed';
  expect(original.tracks[0]!.name).not.toBe('Changed');
  expect(saveVideoProject).toHaveBeenLastCalledWith(copy, { baseRevision: null });
});

it('imports accepted Gallery interaction authoring through the recording editor route', async () => {
  await mockRecordingProjectLoad();
  const { createQuickEditAdvancedState } =
    await import('../../../features/video/review/advanced/defaults');
  const advanced = createQuickEditAdvancedState();
  advanced.cursorFocusPath = {
    version: 1,
    mode: 'follow',
    gapPolicy: 'hold',
    smoothing: 0.5,
    sensitivity: 0.5,
    segments: [
      {
        id: 'segment',
        binding: { kind: 'project' },
        start: 0,
        end: 5,
        keys: [{ id: 'key', time: 1, x: 0.2, y: 0.3, anchor: 'manual', interpolation: 'smooth' }],
      },
    ],
  };
  advanced.actionAudio = [
    {
      ref: { kind: 'signal', id: 'typed' },
      enabled: true,
      presetId: 'typing-recorded-v2',
      volume: 0.35,
      offset: 0,
    },
  ];
  readVideoWorkspace.mockResolvedValue({
    workspace: {
      aggregateId: 'recording:recording-1',
      sourceAssetId: 'recording-body',
      source: { size: 5, mimeType: 'video/webm', duration: 5, width: 1280, height: 720 },
      advanced,
    },
    draft: null,
  });
  window.history.replaceState({}, '', '/video-editor.html?id=recording-1');
  const result = await loadInitialProjectFromLocation();
  expect(readVideoWorkspace).toHaveBeenCalledWith('recording:recording-1');
  expect(result.project?.cursorFocusPath?.segments[0]?.binding).toMatchObject({
    kind: 'recording-source',
    recordingId: 'recording-1',
  });
  expect(result.project?.actionFeedback?.[0]?.settings).toEqual(advanced.actionAudio);
});

it('refuses stale Gallery interaction authoring before persisting a new project', async () => {
  await mockRecordingProjectLoad();
  saveVideoProject.mockClear();
  readVideoWorkspace.mockResolvedValue({
    workspace: {
      sourceAssetId: 'replaced-body',
      source: { size: 5, mimeType: 'video/webm', duration: 5, width: 1280, height: 720 },
    },
    draft: null,
  });
  window.history.replaceState({}, '', '/video-editor.html?id=recording-1');
  await expect(loadInitialProjectFromLocation()).rejects.toThrow(
    'Review interaction source has changed.'
  );
  expect(saveVideoProject).not.toHaveBeenCalled();
  expect(deleteProjectAsset).not.toHaveBeenCalled();
});

it('propagates review admission failure before persisting the recording project', async () => {
  await mockRecordingProjectLoad();
  saveVideoProject.mockClear();
  readVideoWorkspace.mockRejectedValue(new Error('Review admission failed'));
  window.history.replaceState({}, '', '/video-editor.html?id=recording-1');
  await expect(loadInitialProjectFromLocation()).rejects.toThrow('Review admission failed');
  expect(saveVideoProject).not.toHaveBeenCalled();
});
