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
    loadImageMetadata: vi.fn(),
  };
});

vi.mock('../../../workflows/background-images/intake', () => ({
  prepareBackgroundImage: vi.fn(async (file: File) => file),
}));
vi.mock('../../../workflows/background-images/static-logo', () => ({
  prepareStaticLogo: vi.fn(async (file: File) => file),
}));

vi.mock('./import-validation', () => ({ assertImportableProjectAssetFile: vi.fn() }));

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

it('transfers captured cursor facts without changing Gallery or painting a new pointer', async () => {
  const snapshot = await transferFixture();
  const before = structuredClone(snapshot);
  const telemetry = {
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
  };
  const captured = structuredClone(telemetry);
  getRecordingTelemetry.mockResolvedValue(telemetry);
  const result = await loadInitialProjectFromLocation();
  expect(result.project!.cursorTrack).toMatchObject({
    skin: { ...telemetry.cursorTrack.skin, hidden: true },
    sourceObservations: [
      {
        recordingId: 'recording-1',
        samples: [expect.objectContaining({ id: 'sample', time: 0.5, visible: true })],
      },
    ],
  });
  expect(saveVideoProject).toHaveBeenCalledTimes(1);
  expect(saveVideoProject).toHaveBeenCalledWith(
    expect.objectContaining({ id: result.project!.id }),
    { baseRevision: null, expectedReviewWorkspace: snapshot.workspace }
  );
  expect(telemetry).toEqual(captured);
  expect(snapshot).toEqual(before);
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

it('claims one immutable image for background and retained watermark, and retries missing bytes', async () => {
  const snapshot = await transferFixture();
  const { createQuickEditWatermark } =
    await import('../../../features/video/project/scene/watermark');
  snapshot.workspace.advanced.background = {
    enabled: true,
    type: 'image',
    assetId: 'project-asset:scene-image',
    imageFit: 'contain',
    layout: { padding: 12, cornerRadius: 8 },
  };
  snapshot.workspace.advanced.watermark = {
    ...createQuickEditWatermark('Retained logo'),
    mode: 'none',
    image: { assetId: 'project-asset:scene-image', width: 32, height: 16, size: 0.2, opacity: 0.7 },
  };
  const before = structuredClone(snapshot);
  getProjectAsset.mockResolvedValue({ status: 'not-found' });
  await expect(loadInitialProjectFromLocation()).rejects.toThrow(
    'Review image resource is unavailable.'
  );
  expect(saveVideoProject).not.toHaveBeenCalled();
  expect(deleteProjectAsset).not.toHaveBeenCalled();
  getProjectAsset.mockClear();
  getProjectAsset.mockResolvedValue({
    status: 'ready',
    entry: {
      id: 'scene-image',
      assetId: 'immutable-image-bytes',
      mimeType: 'image/png',
      size: 4,
      createdAt: 1,
      file: new File(['logo'], 'scene-image', { type: 'image/png' }),
    },
  });
  const { loadImageMetadata } = await import('../media-metadata');
  const { prepareBackgroundImage } = await import('../../../workflows/background-images/intake');
  const { prepareStaticLogo } = await import('../../../workflows/background-images/static-logo');
  vi.mocked(prepareBackgroundImage).mockImplementation(async (file) => file);
  vi.mocked(prepareStaticLogo).mockImplementation(async (file) => file);
  vi.mocked(loadImageMetadata).mockResolvedValue({
    width: 32,
    height: 16,
    mimeType: 'image/png',
    size: 4,
  });
  const result = await loadInitialProjectFromLocation();
  const image = result.project!.assets.find((asset) => asset.type === 'IMAGE');
  expect(image).toMatchObject({
    source: { kind: 'project-asset', projectAssetId: 'scene-image' },
    metadata: { width: 32, height: 16 },
  });
  const { translate } = await import('../../../platform/i18n');
  expect(image!.name).toBe(translate('gallery.videoReview.watermark'));
  expect(result.project!.sceneBackground).toMatchObject({
    kind: 'image',
    assetId: image!.id,
    imageFit: 'contain',
  });
  expect(result.project!.watermark).toMatchObject({
    mode: 'none',
    image: { assetId: `project-asset:${image!.id}` },
  });
  expect(getProjectAsset).toHaveBeenCalledTimes(1);
  expect(prepareStaticLogo).toHaveBeenCalledTimes(1);
  expect(saveVideoProject).toHaveBeenCalledTimes(1);
  expect(deleteProjectAsset).not.toHaveBeenCalled();
  expect(snapshot).toEqual(before);
});

it.each(['mime', 'metadata', 'intake', 'changed-bytes'] as const)(
  'refuses invalid image %s before any destination save',
  async (failure) => {
    const snapshot = await transferFixture();
    snapshot.workspace.advanced.background = {
      enabled: true,
      type: 'image',
      assetId: 'project-asset:scene-image',
      imageFit: 'cover',
      layout: { padding: 8, cornerRadius: 4 },
    };
    const mimeType = failure === 'mime' ? 'image/svg+xml' : 'image/png';
    getProjectAsset.mockResolvedValue({
      status: 'ready',
      entry: {
        id: 'scene-image',
        assetId: 'immutable-image',
        mimeType,
        size: 4,
        createdAt: 1,
        file: new File(['logo'], 'Logo.png', { type: mimeType }),
      },
    });
    const { loadImageMetadata } = await import('../media-metadata');
    const { prepareBackgroundImage } = await import('../../../workflows/background-images/intake');
    vi.mocked(prepareBackgroundImage).mockImplementation(async (file) => file);
    vi.mocked(loadImageMetadata).mockResolvedValue({
      width: 32,
      height: 16,
      mimeType,
      size: failure === 'metadata' ? 5 : 4,
    });
    if (failure === 'intake')
      vi.mocked(prepareBackgroundImage).mockRejectedValue(
        new Error('Unsupported background image')
      );
    if (failure === 'changed-bytes') {
      const entry = await getProjectAsset('scene-image');
      if (entry.status !== 'ready') throw new Error('Missing image fixture');
      Object.defineProperty(entry.entry.file, 'arrayBuffer', {
        value: async () => new Uint8Array([1, 2, 3, 4]).buffer,
      });
      const changed = new File(['evil'], 'Logo.png', { type: mimeType });
      Object.defineProperty(changed, 'arrayBuffer', {
        value: async () => new Uint8Array([4, 3, 2, 1]).buffer,
      });
      vi.mocked(prepareBackgroundImage).mockResolvedValue(changed);
    }
    const before = structuredClone(snapshot);
    await expect(loadInitialProjectFromLocation()).rejects.toThrow(
      failure === 'intake'
        ? 'Unsupported background image'
        : 'Review image resource is unavailable.'
    );
    expect(saveVideoProject).not.toHaveBeenCalled();
    expect(deleteProjectAsset).not.toHaveBeenCalled();
    expect(snapshot).toEqual(before);
  }
);

it('refuses a Gallery snapshot changed while image metadata is pending', async () => {
  const snapshot = await transferFixture();
  snapshot.workspace.advanced.background = {
    enabled: true,
    type: 'image',
    assetId: 'project-asset:scene-image',
    imageFit: 'cover',
    layout: { padding: 8, cornerRadius: 4 },
  };
  getProjectAsset.mockResolvedValue({
    status: 'ready',
    entry: {
      id: 'scene-image',
      assetId: 'immutable-image',
      mimeType: 'image/png',
      size: 4,
      createdAt: 1,
      file: new File(['logo'], 'Logo.png', { type: 'image/png' }),
    },
  });
  const { prepareBackgroundImage } = await import('../../../workflows/background-images/intake');
  vi.mocked(prepareBackgroundImage).mockImplementation(async (file) => file);
  const { loadImageMetadata } = await import('../media-metadata');
  const ready = Promise.withResolvers<void>();
  const metadata = Promise.withResolvers<Awaited<ReturnType<typeof loadImageMetadata>>>();
  vi.mocked(loadImageMetadata).mockImplementation(() => {
    ready.resolve();
    return metadata.promise;
  });
  const pending = loadInitialProjectFromLocation();
  await ready.promise;
  snapshot.workspace.revision++;
  metadata.resolve({ width: 32, height: 16, mimeType: 'image/png', size: 4 });
  await expect(pending).rejects.toThrow('Review project changed before transfer.');
  expect(saveVideoProject).not.toHaveBeenCalled();
  expect(deleteProjectAsset).not.toHaveBeenCalled();
});

async function cameraTransferFixture() {
  const snapshot = await transferFixture();
  const { createQuickEditWebcam } = await import('../../../features/video/review/advanced/webcam');
  snapshot.workspace.advanced.webcam = {
    ...createQuickEditWebcam(
      'project-asset:camera-body',
      { width: 160, height: 90 },
      { width: 1280, height: 720 }
    ),
    offsetSeconds: 0.75,
    mirrored: true,
  };
  const { loadVideoMetadata } = await import('../media-metadata');
  vi.mocked(loadVideoMetadata).mockResolvedValue({
    width: 160,
    height: 90,
    duration: 3,
    mimeType: 'video/webm',
    size: 4,
    hasAudio: false,
    audioPeaks: null,
  });
  getProjectAsset.mockResolvedValue({
    status: 'ready',
    entry: {
      id: 'camera-body',
      assetId: 'camera-immutable',
      mimeType: 'video/webm',
      size: 4,
      createdAt: 1,
      updatedAt: 1,
      file: new File(['webm'], 'camera-body', { type: 'video/webm' }),
    },
  });
  return snapshot;
}

it('transfers immutable camera media with main-clock slices and retries missing bytes', async () => {
  const snapshot = await cameraTransferFixture();
  const primary = await importRecordingProjectAssetMock('recording-1');
  primary.metadata.hasAudio = true;
  const before = structuredClone(snapshot);
  getProjectAsset.mockResolvedValueOnce({ status: 'missing' });
  await expect(loadInitialProjectFromLocation()).rejects.toThrow(
    'Review camera resource is unavailable.'
  );
  expect(saveVideoProject).not.toHaveBeenCalled();
  const result = await loadInitialProjectFromLocation();
  const cameraTrack = result.project!.tracks.find((track) => track.role === 'CAMERA')!;
  expect(cameraTrack).toMatchObject({ visible: true });
  const cameras = result.project!.clips.filter((clip) => clip.trackId === cameraTrack.id);
  expect(cameras).toHaveLength(2);
  const { resolveVideoCompositionVisualLayers } =
    await import('../../../features/video/composition/timeline/frame/layers');
  expect(resolveVideoCompositionVisualLayers(result.project!, 1).at(-1)?.clipId).toBe(
    cameras[1]!.id
  );
  for (const camera of cameras)
    expect(camera).toMatchObject({
      muted: true,
      cameraMirrored: true,
      cameraTiming: { offsetSeconds: 0.75, transitions: 'bounded' },
    });
  const firstCamera = cameras[0]!;
  if (firstCamera.type !== 'VIDEO') throw new Error('Expected camera video');
  const asset = result.project!.assets.find((asset) => asset.id === firstCamera.assetId)!;
  expect(asset).toMatchObject({
    type: 'VIDEO',
    source: {
      kind: 'project-asset',
      projectAssetId: 'camera-body',
    },
  });
  const { translate } = await import('../../../platform/i18n');
  expect(asset.name).toBe(translate('gallery.videoReview.webcam'));
  const { assertImportableProjectAssetFile } = await import('./import-validation');
  expect(assertImportableProjectAssetFile).toHaveBeenCalledWith(expect.any(File), 'VIDEO');
  expect(saveVideoProject).toHaveBeenCalledTimes(1);
  expect(deleteProjectAsset).not.toHaveBeenCalled();
  expect(snapshot).toEqual(before);
});

it.each(['mime', 'metadata', 'intake'] as const)(
  'refuses invalid camera %s before destination publication',
  async (failure) => {
    await cameraTransferFixture();
    if (failure === 'mime') {
      const resource = await getProjectAsset('camera-body');
      resource.entry.file = new File(['webm'], 'Camera.svg', { type: 'image/svg+xml' });
    }
    if (failure === 'metadata') {
      const { loadVideoMetadata } = await import('../media-metadata');
      vi.mocked(loadVideoMetadata).mockResolvedValue({
        width: 160,
        height: 90,
        duration: 3,
        mimeType: 'video/mp4',
        size: 99,
        hasAudio: false,
        audioPeaks: null,
      });
    }
    if (failure === 'intake') {
      const { assertImportableProjectAssetFile } = await import('./import-validation');
      vi.mocked(assertImportableProjectAssetFile).mockRejectedValue(
        new Error('Invalid video signature')
      );
    }
    await expect(loadInitialProjectFromLocation()).rejects.toThrow(
      failure === 'intake' ? 'Invalid video signature' : 'Review camera resource is unavailable.'
    );
    expect(saveVideoProject).not.toHaveBeenCalled();
    expect(deleteProjectAsset).not.toHaveBeenCalled();
  }
);

it('refuses a Gallery snapshot changed while camera metadata is pending', async () => {
  const snapshot = await cameraTransferFixture();
  const { loadVideoMetadata } = await import('../media-metadata');
  const metadata = Promise.withResolvers<Awaited<ReturnType<typeof loadVideoMetadata>>>();
  const started = Promise.withResolvers<void>();
  vi.mocked(loadVideoMetadata).mockImplementation(() => {
    started.resolve();
    return metadata.promise;
  });
  const pending = loadInitialProjectFromLocation();
  await started.promise;
  readVideoWorkspace.mockResolvedValue({
    ...snapshot,
    workspace: { ...snapshot.workspace, revision: 4 },
  });
  metadata.resolve({
    width: 160,
    height: 90,
    duration: 3,
    mimeType: 'video/webm',
    size: 4,
    hasAudio: false,
    audioPeaks: null,
  });
  await expect(pending).rejects.toThrow('Review project changed before transfer.');
  expect(saveVideoProject).not.toHaveBeenCalled();
  expect(deleteProjectAsset).not.toHaveBeenCalled();
});

it('admits canonical webcam codec MIME metadata without changing immutable bytes', async () => {
  await cameraTransferFixture();
  const resource = await getProjectAsset('camera-body');
  resource.entry.file = new File(['webm'], 'camera-body', { type: 'video/webm; codecs="vp8"' });
  resource.entry.mimeType = 'video/webm';
  const { loadVideoMetadata } = await import('../media-metadata');
  vi.mocked(loadVideoMetadata).mockResolvedValue({
    width: 160,
    height: 90,
    duration: 3,
    mimeType: 'video/webm; codecs="vp8"',
    size: 4,
    hasAudio: false,
    audioPeaks: null,
  });
  const result = await loadInitialProjectFromLocation();
  expect(result.project!.assets).toContainEqual(
    expect.objectContaining({
      type: 'VIDEO',
      source: { kind: 'project-asset', projectAssetId: 'camera-body' },
      metadata: expect.objectContaining({ mimeType: 'video/webm; codecs="vp8"' }),
    })
  );
  expect(saveVideoProject).toHaveBeenCalledOnce();
});
