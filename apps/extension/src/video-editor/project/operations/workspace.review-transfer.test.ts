// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { VideoProjectAssetType } from '../../../features/video/project/types';
import { loadInitialProjectFromLocation } from './workspace';

const {
  deleteProjectAsset,
  getProjectAsset,
  ensureLibraryMediaAssetsMock,
  getRecording,
  getRecordingTelemetry,
  readVideoWorkspace,
  getVideoProject,
  importRecordingProjectAssetMock,
  saveVideoProject,
} = vi.hoisted(() => ({
  deleteProjectAsset: vi.fn(),
  getProjectAsset: vi.fn(),
  ensureLibraryMediaAssetsMock: vi.fn(),
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
  getProjectAsset,
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
    loadAudioMetadata: vi.fn(),
  };
});

vi.mock('./assets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./assets')>();
  return {
    ...actual,
    importRecordingProjectAsset: importRecordingProjectAssetMock,
    ensureLibraryMediaAssets: ensureLibraryMediaAssetsMock,
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

async function transferFixture() {
  await mockRecordingProjectLoad();
  getRecordingTelemetry.mockResolvedValue(undefined);
  const { createQuickEditAdvancedState } =
    await import('../../../features/video/review/advanced/defaults');
  const { inspectVideoWorkspace } =
    await import('../../../composition/persistence/review-workspaces/parser');
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  advanced.ui.tracks.audio = true;
  const snapshot = {
    workspace: {
      aggregateId: 'recording:recording-1',
      formatVersion: 1,
      sourceAssetId: 'recording-body',
      source: { size: 5, mimeType: 'video/webm', duration: 5, width: 1280, height: 720 },
      revision: 3,
      createdAt: 10,
      updatedAt: 20,
      history: [
        {
          id: 'cut-op',
          at: 11,
          target: 'edit',
          before: null,
          after: { id: 'cut', kind: 'cut', start: 1, end: 2, requestedStart: 1, requestedEnd: 2 },
        },
      ],
      cursor: 1,
      advanced,
    },
    draft: null,
  };
  const admitted = inspectVideoWorkspace(snapshot.workspace).workspace;
  if (!admitted) throw new Error('Expected admitted Gallery project');
  const accepted = { workspace: admitted, draft: null };
  readVideoWorkspace.mockResolvedValue(accepted);
  ensureLibraryMediaAssetsMock.mockImplementation(async () => [
    await importRecordingProjectAssetMock('recording-1'),
  ]);
  window.history.replaceState(
    {},
    '',
    '/video-editor.html?review=recording%3Arecording-1' +
      '&reviewRevision=3&reviewCreatedAt=10&reviewSourceAssetId=recording-body'
  );
  return accepted;
}

beforeEach(() => {
  vi.resetAllMocks();
  saveVideoProject.mockImplementation(async (project) => ({
    ...project,
    updatedAt: project.updatedAt + 1,
  }));
  window.history.replaceState({}, '', '/video-editor.html');
});

it('creates a separate editable project from saved Gallery cuts instead of the raw recording', async () => {
  const snapshot = await transferFixture();
  const before = structuredClone(snapshot);
  const result = await loadInitialProjectFromLocation();
  expect(result.project!.duration).toBe(4);
  expect(
    result
      .project!.clips.filter((clip) => clip.type === 'VIDEO')
      .map((clip) => [clip.startTime, clip.sourceStart, clip.duration])
  ).toEqual([
    [0, 0, 1],
    [1, 2, 3],
  ]);
  expect(saveVideoProject).toHaveBeenCalledTimes(1);
  expect(saveVideoProject).toHaveBeenCalledWith(
    expect.objectContaining({ id: result.project!.id }),
    { baseRevision: null, expectedReviewWorkspace: snapshot.workspace }
  );
  expect(snapshot).toEqual(before);
  expect(deleteProjectAsset).not.toHaveBeenCalled();
  expect(ensureLibraryMediaAssetsMock).toHaveBeenCalledWith(
    expect.anything(),
    'recording:recording-1'
  );
  const second = await loadInitialProjectFromLocation();
  expect(second.project!.id).not.toBe(result.project!.id);
  expect(snapshot).toEqual(before);
  const { isExportReadyVideoProject } =
    await import('../../../features/video/project/validation/root');
  expect(isExportReadyVideoProject(result.project)).toBe(true);
});

it.each(['basic', 'advanced'] as const)(
  'transfers actual new Gallery presentation defaults in %s mode',
  async (mode) => {
    const snapshot = await transferFixture();
    const { createNewWorkspacePresentationSettings } =
      await import('../../../features/video/review/advanced/presentation');
    snapshot.workspace.advanced.ui.mode = mode;
    snapshot.workspace.advanced.background = { enabled: false, zoomBehavior: 'window' };
    snapshot.workspace.advanced.presentation = createNewWorkspacePresentationSettings();
    const before = structuredClone(snapshot);
    const transferred = await loadInitialProjectFromLocation();
    expect(transferred.project?.sceneEdges).toMatchObject({
      intro: { enabled: mode === 'advanced', duration: 0.4 },
      outro: { enabled: mode === 'advanced', duration: 0.4 },
    });
    expect(saveVideoProject).toHaveBeenCalledOnce();
    expect(snapshot).toEqual(before);
  }
);

it('opens the saved Native root on reload instead of creating another migration', async () => {
  await transferFixture();
  const transferred = await loadInitialProjectFromLocation();
  saveVideoProject.mockClear();
  ensureLibraryMediaAssetsMock.mockClear();
  getVideoProject.mockResolvedValue({
    status: 'ready',
    project: transferred.project,
    workspaceRevision: 1,
  });
  window.history.replaceState({}, '', `/video-editor.html?project=${transferred.project!.id}`);
  const reopened = await loadInitialProjectFromLocation();
  expect(reopened.project).toEqual(transferred.project);
  expect(saveVideoProject).not.toHaveBeenCalled();
  expect(ensureLibraryMediaAssetsMock).not.toHaveBeenCalled();
});

it.each(['missing', 'revision', 'generation', 'source', 'blocked'] as const)(
  'refuses %s transfer without publishing a raw fallback',
  async (kind) => {
    const snapshot = await transferFixture();
    if (kind === 'missing') readVideoWorkspace.mockResolvedValue(null);
    if (kind === 'revision')
      readVideoWorkspace.mockResolvedValue({
        ...snapshot,
        workspace: { ...snapshot.workspace, revision: 4 },
      });
    if (kind === 'generation')
      readVideoWorkspace.mockResolvedValue({
        ...snapshot,
        workspace: { ...snapshot.workspace, createdAt: 9 },
      });
    if (kind === 'source') snapshot.workspace.sourceAssetId = 'replaced-body';
    if (kind === 'blocked') snapshot.workspace.advanced.background.enabled = true;
    const before = structuredClone(snapshot);
    await expect(loadInitialProjectFromLocation()).rejects.toThrow();
    expect(saveVideoProject).not.toHaveBeenCalled();
    expect(deleteProjectAsset).not.toHaveBeenCalled();
    expect(snapshot).toEqual(before);
  }
);

it.each(['revision', 'generation', 'source', 'deleted'] as const)(
  'refuses %s changes during asynchronous resource preparation',
  async (kind) => {
    const snapshot = await transferFixture();
    let enter!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    ensureLibraryMediaAssetsMock.mockImplementationOnce(async () => {
      enter();
      await held;
      return [await importRecordingProjectAssetMock('recording-1')];
    });
    const pending = loadInitialProjectFromLocation();
    await entered;
    readVideoWorkspace.mockResolvedValue(
      kind === 'deleted'
        ? null
        : {
            ...snapshot,
            workspace: {
              ...snapshot.workspace,
              ...(kind === 'revision'
                ? { revision: 4 }
                : kind === 'generation'
                  ? { createdAt: 9 }
                  : { sourceAssetId: 'other-body' }),
            },
          }
    );
    release();
    await expect(pending).rejects.toThrow('Review project changed before transfer.');
    expect(saveVideoProject).not.toHaveBeenCalled();
  }
);

it.each([
  'reviewRevision=-1&reviewCreatedAt=10',
  'reviewRevision=3.5&reviewCreatedAt=10',
  'reviewRevision=3',
  'reviewRevision=9007199254740992&reviewCreatedAt=10',
])('rejects malformed review target %s before reading or writing', async (query) => {
  window.history.replaceState(
    {},
    '',
    '/video-editor.html?review=recording%3Arecording-1' +
      `&${query}&reviewSourceAssetId=recording-body&id=recording-1`
  );
  await expect(loadInitialProjectFromLocation()).rejects.toThrow(
    'Review project transfer target is invalid.'
  );
  expect(readVideoWorkspace).not.toHaveBeenCalled();
  expect(getRecording).not.toHaveBeenCalled();
  expect(saveVideoProject).not.toHaveBeenCalled();
});

it('keeps unsupported cursor facts intact and refuses conversion before save', async () => {
  await transferFixture();
  getRecordingTelemetry.mockResolvedValue({
    recordingId: 'recording-1',
    createdAt: 1,
    updatedAt: 2,
    captureMode: 'TAB',
    viewport: null,
    cursorTrack: {
      captureMode: 'separate',
      samples: [{ id: 'sample', time: 0.5, x: 10, y: 20, visible: true }],
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
  await expect(loadInitialProjectFromLocation()).rejects.toThrow(
    'Review project settings cannot be transferred.'
  );
  expect(saveVideoProject).not.toHaveBeenCalled();
});

it('claims existing accepted audio resources without copying bytes and retries a missing resource', async () => {
  const snapshot = await transferFixture();
  snapshot.workspace.advanced.audio.voiceover = [
    {
      id: 'voice',
      assetId: 'project-asset:voice-bytes',
      timelineStart: 0,
      sourceOffset: 0,
      duration: 1,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    },
  ];
  getProjectAsset.mockResolvedValue({ status: 'not-found' });
  await expect(loadInitialProjectFromLocation()).rejects.toThrow(
    'Review audio resource is unavailable.'
  );
  expect(saveVideoProject).not.toHaveBeenCalled();
  getProjectAsset.mockResolvedValue({
    status: 'ready',
    entry: {
      id: 'voice-bytes',
      assetId: 'voice-object',
      mimeType: 'audio/wav',
      size: 4,
      createdAt: 1,
      file: new File(['wave'], 'Voice.wav', { type: 'audio/wav' }),
    },
  });
  const { loadAudioMetadata } = await import('../media-metadata');
  vi.mocked(loadAudioMetadata).mockResolvedValue({
    duration: 2,
    mimeType: 'audio/wav',
    size: 4,
    hasAudio: true,
    audioPeaks: null,
  });
  const result = await loadInitialProjectFromLocation();
  expect(
    result.project!.assets.find((asset) => asset.id === 'project-asset:voice-bytes')
  ).toMatchObject({ source: { kind: 'project-asset', projectAssetId: 'voice-bytes' } });
  expect(
    result.project!.clips.some(
      (clip) => clip.type === 'AUDIO' && clip.assetId === 'project-asset:voice-bytes'
    )
  ).toBe(true);
  expect(saveVideoProject).toHaveBeenCalledTimes(1);
  expect(deleteProjectAsset).not.toHaveBeenCalled();
});

it('converts a non-recording Library video through the existing material placement owner', async () => {
  const snapshot = await transferFixture();
  snapshot.workspace.aggregateId = 'project-asset:library-video';
  const asset = await importRecordingProjectAssetMock('recording-1');
  ensureLibraryMediaAssetsMock.mockResolvedValue([
    {
      ...asset,
      type: 'VIDEO',
      source: { kind: 'project-asset', projectAssetId: 'library-video' },
    },
  ]);
  window.history.replaceState(
    {},
    '',
    '/video-editor.html?review=project-asset%3Alibrary-video' +
      '&reviewRevision=3&reviewCreatedAt=10&reviewSourceAssetId=recording-body'
  );
  const result = await loadInitialProjectFromLocation();
  expect(result.recordingId).toBeNull();
  expect(result.project!.baseRecordingId).toBeNull();
  expect(result.project!.duration).toBe(4);
  expect(result.project!.clips.filter((clip) => clip.type === 'VIDEO')).toHaveLength(2);
  expect(saveVideoProject).toHaveBeenCalledTimes(1);
});

it('refuses archive source replacement before the first Native read and accepts a fresh selection', async () => {
  const selected = await transferFixture();
  const before = structuredClone(selected);
  const { prepareVideoReviewRestore, putVideoReviewRestore } =
    await import('../../../composition/persistence/review-workspaces/backup-restore');
  const { inspectVideoWorkspace } =
    await import('../../../composition/persistence/review-workspaces/parser');
  const { sourceAssetId: _selectedPhysicalSource, ...portable } = selected.workspace;
  const restored = prepareVideoReviewRestore({
    review: { workspace: portable, draft: null },
    sourceAggregateId: selected.workspace.aggregateId,
    targetAggregateId: selected.workspace.aggregateId,
    sourceAssetId: 'restored-physical-body',
  });
  const published = new Map<string, unknown>();
  await putVideoReviewRestore({
    review: restored,
    workspaces: {
      put: async (workspace) => {
        published.set(workspace.aggregateId, structuredClone(workspace));
      },
    },
    drafts: { put: vi.fn(), delete: vi.fn() },
  });
  readVideoWorkspace.mockImplementation(async (aggregateId: string) => {
    const parsed = inspectVideoWorkspace(published.get(aggregateId)).workspace;
    if (!parsed) throw new Error('Invalid restored Gallery workspace');
    return { workspace: parsed, draft: null };
  });
  getRecording.mockResolvedValue({
    assetId: 'restored-physical-body',
    file: new Blob(['fresh'], { type: 'video/webm' }),
    createdAt: 1,
    filename: 'recording.webm',
    id: 'recording-1',
    size: 5,
  });
  expect(restored.workspace.revision).toBe(selected.workspace.revision);
  expect(restored.workspace.createdAt).toBe(selected.workspace.createdAt);
  expect(restored.workspace.updatedAt).toBe(selected.workspace.updatedAt);
  expect(restored.workspace.source).toEqual(selected.workspace.source);
  expect(restored.workspace.sourceAssetId).not.toBe(selected.workspace.sourceAssetId);
  const publishedBefore = structuredClone(published);
  await expect(loadInitialProjectFromLocation()).rejects.toThrow(
    'Review project changed before transfer.'
  );
  expect(ensureLibraryMediaAssetsMock).not.toHaveBeenCalled();
  expect(getRecording).not.toHaveBeenCalled();
  expect(getProjectAsset).not.toHaveBeenCalled();
  expect(saveVideoProject).not.toHaveBeenCalled();
  expect(deleteProjectAsset).not.toHaveBeenCalled();
  expect(published).toEqual(publishedBefore);
  expect(selected).toEqual(before);
  const freshUrl = new URL(window.location.href);
  freshUrl.searchParams.set('reviewSourceAssetId', restored.workspace.sourceAssetId);
  window.history.replaceState({}, '', freshUrl);
  const retried = await loadInitialProjectFromLocation();
  expect(retried.project?.duration).toBe(4);
  expect(saveVideoProject).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ id: retried.project!.id }),
    { baseRevision: null, expectedReviewWorkspace: restored.workspace }
  );
  expect(published).toEqual(publishedBefore);
  expect(selected).toEqual(before);
});

it.each([undefined, '', 'a'.repeat(257)])(
  'refuses an invalid selected physical source token %s before reading or preparing resources',
  async (sourceAssetId) => {
    const url = new URL('/video-editor.html', window.location.origin);
    url.searchParams.set('review', 'recording:recording-1');
    url.searchParams.set('reviewRevision', '3');
    url.searchParams.set('reviewCreatedAt', '10');
    if (sourceAssetId !== undefined) url.searchParams.set('reviewSourceAssetId', sourceAssetId);
    window.history.replaceState({}, '', url);
    await expect(loadInitialProjectFromLocation()).rejects.toThrow(
      'Review project transfer target is invalid.'
    );
    expect(readVideoWorkspace).not.toHaveBeenCalled();
    expect(ensureLibraryMediaAssetsMock).not.toHaveBeenCalled();
    expect(getRecording).not.toHaveBeenCalled();
    expect(saveVideoProject).not.toHaveBeenCalled();
  }
);
