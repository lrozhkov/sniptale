import { useVideoEditorStore } from '../../state/store';
// @vitest-environment jsdom

import { createAudioClip } from '../../../features/video/project/timeline/project-meta.test.helpers';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../../../features/video/project/factories/creation';
import {
  VideoProjectAssetType,
  VideoTrackKind,
  type VideoProjectAsset,
} from '../../../features/video/project/types';
import { useAssetHandlers } from './assets';
import { ensureLibraryMediaAssets, ensureRecordingAssets } from '../../project/operations/ops';

const { deleteProjectAssetMock, importProjectAssetMock, toastErrorMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  deleteProjectAssetMock: vi.fn(),
  importProjectAssetMock: vi.fn(),
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({
  toast: { error: toastErrorMock },
}));

vi.mock('../../../composition/persistence/projects/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/projects/index')>()),
  deleteProjectAsset: deleteProjectAssetMock,
}));

vi.mock('../../project/operations/ops', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../project/operations/ops')>();
  return {
    ...actual,
    ensureRecordingAssets: vi.fn(),
    ensureLibraryMediaAssets: vi.fn(),
    importProjectAsset: importProjectAssetMock,
  };
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestHandlers: ReturnType<typeof useAssetHandlers> | null = null;

function renderHook(params: Parameters<typeof useAssetHandlers>[0]) {
  function Harness() {
    latestHandlers = useAssetHandlers(params);
    return null;
  }

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<Harness />);
  });
}

type TestAssetHandlerPort = Parameters<typeof useAssetHandlers>[0] & { currentTime: number };

function createParams(): TestAssetHandlerPort {
  const project = createEmptyVideoProject('Recorded audio');
  const params: TestAssetHandlerPort = {
    currentTime: 5,
    beginProjectHistoryTransaction: vi.fn(() => Symbol()),
    endProjectHistoryTransaction: vi.fn(),
    getCurrentProject: () => project,
    getCurrentProjectId: () => project.id,
    getCurrentTime: () => params.currentTime,
    addAssetClip: vi.fn(() => 'clip-1'),
    moveClip: vi.fn(),
    setError: vi.fn(),
    trimClipEnd: vi.fn(),
    trimClipStart: vi.fn(),
    updateProject: vi.fn(),
    upsertAsset: vi.fn(),
    upsertAssets: vi.fn(),
  };
  return params;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  latestHandlers = null;
  importProjectAssetMock.mockResolvedValue({
    id: 'asset-1',
    type: VideoProjectAssetType.AUDIO,
    name: 'voice.webm',
    source: { kind: 'project-asset', projectAssetId: 'asset-1' },
    metadata: {
      width: 0,
      height: 0,
      duration: 6,
      mimeType: 'audio/webm',
      size: 100,
      hasAudio: true,
      audioPeaks: null,
    },
    createdAt: 1,
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestHandlers = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('useAssetHandlers', () => {
  it.each(['handleImportAudio', 'handleImportImage', 'handleImportVideo'] as const)(
    '%s reports decoder failure without replacing the project and permits a retry',
    async (handler) => {
      const params = createParams();
      renderHook(params);
      importProjectAssetMock.mockRejectedValueOnce(new Error('Invalid media bytes'));
      const file = new File(['invalid'], 'damaged.media');
      await act(async () => latestHandlers?.[handler](file, { destination: 'materials' }));
      expect(params.setError).not.toHaveBeenCalled();
      expect(params.upsertAsset).not.toHaveBeenCalled();
      expect(params.addAssetClip).not.toHaveBeenCalled();
      expect(toastErrorMock).toHaveBeenCalledOnce();
      expect(toastErrorMock.mock.calls[0]?.[0]).not.toContain('Invalid media bytes');
      await act(async () => latestHandlers?.[handler](file, { destination: 'materials' }));
      expect(params.upsertAsset).toHaveBeenCalledOnce();
      expect(params.addAssetClip).not.toHaveBeenCalled();
      expect(params.setError).not.toHaveBeenCalled();
      expect(toastErrorMock).toHaveBeenCalledOnce();
    }
  );
  it.each(['handleImportAudio', 'handleImportImage', 'handleImportVideo'] as const)(
    '%s registers a reusable material without changing the montage',
    async (handler) => {
      const params = createParams();
      renderHook(params);
      await act(async () => {
        await latestHandlers?.[handler](new File(['media'], 'source.webm'), {
          destination: 'materials',
        });
      });
      expect(params.upsertAsset).toHaveBeenCalledTimes(1);
      expect(params.addAssetClip).not.toHaveBeenCalled();
      expect(params.moveClip).not.toHaveBeenCalled();
      expect(params.trimClipStart).not.toHaveBeenCalled();
    }
  );
  it(
    'imports the prepared recording into materials without creating a clip',
    verifyRecordedAudioImport
  );
  it('imports project assets with explicit timeline placement', verifyTimelineAssetPlacement);
  it('cleans up imported project assets when the target project changes', verifyStaleImportCleanup);
});

async function verifyRecordedAudioImport() {
  const params = createParams();
  renderHook(params);
  params.currentTime = 8;

  await act(async () => {
    await latestHandlers?.handleImportRecordedAudio(new File(['voice'], 'voice.webm'), {
      trimEnd: 4,
      trimStart: 1.5,
    });
  });

  expect(importProjectAssetMock).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'voice.webm' }),
    VideoProjectAssetType.AUDIO
  );
  expect(params.upsertAsset).toHaveBeenCalledTimes(1);
  expect(params.addAssetClip).not.toHaveBeenCalled();
  expect(params.trimClipStart).not.toHaveBeenCalled();
  expect(params.moveClip).not.toHaveBeenCalled();
  expect(params.trimClipEnd).not.toHaveBeenCalled();
}

async function verifyTimelineAssetPlacement() {
  const params = createParams();
  renderHook(params);

  await act(async () => {
    await latestHandlers?.handleImportImage(new File(['image'], 'shot.png'), {
      startTime: 9.25,
      timelineLaneId: 'line-2',
      trackId: 'track-drop',
    });
  });

  expect(importProjectAssetMock).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'shot.png' }),
    VideoProjectAssetType.IMAGE
  );
  expect(params.upsertAsset).toHaveBeenCalledTimes(1);
  expect(params.addAssetClip).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'asset-1' }),
    'track-drop',
    9.25,
    'line-2'
  );
}

async function verifyStaleImportCleanup() {
  const params = createParams();
  params.getCurrentProjectId = () => 'different-project';
  renderHook(params);

  await act(async () => {
    await latestHandlers?.handleImportImage(new File(['image'], 'shot.png'));
  });

  expect(deleteProjectAssetMock).toHaveBeenCalledWith('asset-1');
  expect(params.upsertAsset).not.toHaveBeenCalled();
  expect(params.addAssetClip).not.toHaveBeenCalled();
}

describe('library material import', () => {
  it('coalesces concurrent library insertion and never places a timeline clip', async () => {
    const params = createParams();
    const asset = await importProjectAssetMock();
    const camera = {
      ...asset,
      id: 'camera',
      source: { kind: 'project-asset', projectAssetId: 'camera' },
    };
    vi.mocked(ensureLibraryMediaAssets).mockResolvedValue([asset, camera]);
    renderHook(params);
    const first = latestHandlers!.handleAddLibraryMedia('library-image');
    const second = latestHandlers!.handleAddLibraryMedia('library-image');
    expect(second).toBe(first);
    await act(async () => first);
    expect(ensureLibraryMediaAssets).toHaveBeenCalledOnce();
    expect(params.upsertAssets).toHaveBeenCalledExactlyOnceWith([asset, camera]);
    expect(params.upsertAsset).not.toHaveBeenCalled();
    expect(params.addAssetClip).not.toHaveBeenCalled();
  });

  it.each(['library', 'recording'])(
    'discards only new camera copies after unmount during %s import',
    async (kind) => {
      const params = createParams();
      const screen = await importProjectAssetMock();
      const camera = {
        ...screen,
        id: 'camera',
        source: { kind: 'project-asset', projectAssetId: 'camera' },
      };
      params.getCurrentProject()!.assets.push(screen);
      vi.mocked(ensureLibraryMediaAssets).mockResolvedValue([screen, camera]);
      vi.mocked(ensureRecordingAssets).mockResolvedValue([screen, camera]);
      renderHook(params);
      const pending =
        kind === 'library'
          ? latestHandlers!.handleAddLibraryMedia('source')
          : latestHandlers!.handleAddRecording('source');
      act(() => {
        root?.unmount();
        root = null;
      });
      if (kind === 'library') await expect(pending).rejects.toThrow();
      else await pending;
      expect(deleteProjectAssetMock).toHaveBeenCalledExactlyOnceWith('camera');
      expect(params.upsertAssets).not.toHaveBeenCalled();
      expect(params.setError).not.toHaveBeenCalled();
    }
  );

  it('propagates library insertion failure and allows retry', async () => {
    const params = createParams();
    const asset = await importProjectAssetMock();
    vi.mocked(ensureLibraryMediaAssets).mockRejectedValueOnce(new Error('Unavailable'));
    renderHook(params);
    await expect(latestHandlers!.handleAddLibraryMedia('image')).rejects.toThrow('Unavailable');
    expect(params.upsertAssets).not.toHaveBeenCalled();
    vi.mocked(ensureLibraryMediaAssets).mockResolvedValueOnce([asset]);
    await act(async () => latestHandlers!.handleAddLibraryMedia('image'));
    expect(params.upsertAssets).toHaveBeenCalledExactlyOnceWith([asset]);
  });

  it.each(['switch', 'unmount'])('cleans a new library copy after %s', async (reason) => {
    const params = createParams();
    const asset = await importProjectAssetMock();
    vi.mocked(ensureLibraryMediaAssets).mockResolvedValueOnce([asset]);
    renderHook(params);
    const pending = latestHandlers!.handleAddLibraryMedia('image');
    if (reason === 'switch') params.getCurrentProjectId = () => 'other-project';
    else
      act(() => {
        root?.unmount();
        root = null;
      });
    await expect(pending).rejects.toThrow();
    expect(deleteProjectAssetMock).toHaveBeenCalledExactlyOnceWith('asset-1');
    expect(params.upsertAssets).not.toHaveBeenCalled();
  });

  it.each(['switch', 'unmount'])(
    'preserves newly attached shared library bytes after %s',
    async (reason) => {
      const params = createParams();
      const imported = await importProjectAssetMock();
      const asset = structuredClone({
        ...imported,
        source: {
          kind: 'project-asset',
          projectAssetId: 'shared',
          originMediaId: 'project-asset:shared',
        },
      });
      vi.mocked(ensureLibraryMediaAssets).mockResolvedValueOnce([asset]);
      renderHook(params);
      const pending = latestHandlers!.handleAddLibraryMedia('project-asset:shared');
      if (reason === 'switch') params.getCurrentProjectId = () => 'other-project';
      else
        act(() => {
          root?.unmount();
          root = null;
        });
      await expect(pending).rejects.toThrow();
      expect(deleteProjectAssetMock).not.toHaveBeenCalled();
      expect(params.upsertAssets).not.toHaveBeenCalled();
    }
  );

  it('retains an existing library copy after target changes', async () => {
    const params = createParams();
    const asset = await importProjectAssetMock();
    params.getCurrentProject()!.assets.push(asset);
    vi.mocked(ensureLibraryMediaAssets).mockResolvedValueOnce([asset]);
    renderHook(params);
    const pending = latestHandlers!.handleAddLibraryMedia('image');
    params.getCurrentProjectId = () => 'other-project';
    await expect(pending).rejects.toThrow();
    expect(deleteProjectAssetMock).not.toHaveBeenCalled();
    expect(params.upsertAssets).not.toHaveBeenCalled();
  });

  it('adds the recording to materials without placing any clip', async () => {
    const params = createParams();
    const asset = await importProjectAssetMock();
    vi.mocked(ensureRecordingAssets).mockResolvedValue([asset]);
    renderHook(params);
    await act(async () => latestHandlers!.handleAddRecording('recording'));
    expect(params.upsertAssets).toHaveBeenCalledWith([asset]);
    expect(params.addAssetClip).not.toHaveBeenCalled();
  });

  it('discards a newly copied recording when the project changes while loading', async () => {
    const params = createParams();
    const asset = await importProjectAssetMock();
    let resolve!: (value: typeof asset) => void;
    vi.mocked(ensureRecordingAssets).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    renderHook(params);
    const pending = latestHandlers!.handleAddRecording('recording');
    params.getCurrentProjectId = () => 'another-project';
    await act(async () => {
      resolve([asset]);
      await pending;
    });
    expect(params.upsertAssets).not.toHaveBeenCalled();
    expect(params.addAssetClip).not.toHaveBeenCalled();
    expect(deleteProjectAssetMock).toHaveBeenCalledWith('asset-1');
  });

  it('does not delete an existing recording asset if its project was switched', async () => {
    const params = createParams();
    const asset = await importProjectAssetMock();
    params.getCurrentProject()!.assets.push(asset);
    vi.mocked(ensureRecordingAssets).mockResolvedValue([asset]);
    renderHook(params);
    const pending = latestHandlers!.handleAddRecording('recording');
    params.getCurrentProjectId = () => 'another-project';
    await act(async () => pending);
    expect(params.upsertAssets).not.toHaveBeenCalled();
    expect(deleteProjectAssetMock).not.toHaveBeenCalled();
  });
});

describe('recording into an explicit audio track', () => {
  function setupTarget() {
    const params = createParams();
    const project = params.getCurrentProject()!;
    const track = createVideoProjectTrack('Voice', 1, VideoTrackKind.AUDIO);
    project.tracks.push(track);
    project.duration = 20;
    vi.mocked(params.updateProject).mockImplementation((updater) => {
      Object.assign(project, updater(project));
    });
    return {
      params,
      track,
      target: { projectId: project.id, trackId: track.id, startTime: 7, endTime: 20 },
    };
  }

  it('preserves the opening track and playhead through asynchronous import in one history lease', async () => {
    const { params, target } = setupTarget();
    renderHook(params);
    const pending = latestHandlers!.handleImportRecordedAudio(
      new File(['voice'], 'voice.webm'),
      { trimStart: 1, trimEnd: 4 },
      target
    );
    params.currentTime = 20;
    await act(async () => pending);
    expect(params.updateProject).toHaveBeenCalledOnce();
    const committed = params.getCurrentProject()!;
    expect(committed.assets.filter((asset) => asset.id === 'asset-1')).toHaveLength(1);
    expect(committed.clips).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ trackId: target.trackId, startTime: 8, duration: 6 }),
      ])
    );
    expect(params.upsertAsset).not.toHaveBeenCalled();
    expect(params.addAssetClip).not.toHaveBeenCalled();
    expect(params.beginProjectHistoryTransaction).toHaveBeenCalledTimes(1);
    expect(params.endProjectHistoryTransaction).toHaveBeenCalledTimes(1);
    expect(params.trimClipEnd).not.toHaveBeenCalled();
  });

  it('retries saving the same recorded take without importing or inserting it twice', async () => {
    const { params, target } = setupTarget();
    renderHook(params);
    const take = new Blob(['voice']);
    const file = new File(['voice'], 'voice.webm');
    await act(async () =>
      latestHandlers!.handleImportRecordedAudio(
        file,
        { trimStart: 1, trimEnd: 4 },
        target,
        undefined,
        take
      )
    );
    await act(async () =>
      latestHandlers!.handleImportRecordedAudio(
        file,
        { trimStart: 1, trimEnd: 4 },
        target,
        undefined,
        take
      )
    );
    expect(importProjectAssetMock).toHaveBeenCalledOnce();
    expect(params.updateProject).toHaveBeenCalledOnce();
    expect(
      params.getCurrentProject()!.assets.filter((asset) => asset.id === 'asset-1')
    ).toHaveLength(1);
    expect(params.getCurrentProject()!.clips).toHaveLength(1);
  });

  it.each(['missing', 'locked', 'video', 'project', 'occupied'])(
    'rejects a %s target without importing or placing',
    async (reason) => {
      const { params, track, target } = setupTarget();
      if (reason === 'occupied')
        params
          .getCurrentProject()!
          .clips.push(createAudioClip({ trackId: track.id, startTime: 10, duration: 2 }));
      if (reason === 'missing') params.getCurrentProject()!.tracks = [];
      if (reason === 'locked') track.locked = true;
      if (reason === 'video') track.kind = VideoTrackKind.PRIMARY;
      if (reason === 'project') params.getCurrentProjectId = () => 'another';
      renderHook(params);
      await expect(
        latestHandlers!.handleImportRecordedAudio(
          new File(['voice'], 'voice.webm'),
          { trimStart: 0, trimEnd: 4 },
          target
        )
      ).rejects.toThrow();
      expect(importProjectAssetMock).not.toHaveBeenCalled();
      expect(params.addAssetClip).not.toHaveBeenCalled();
    }
  );

  it('cleans the copy and rejects if the destination is locked during import', async () => {
    const { params, track, target } = setupTarget();
    renderHook(params);
    const pending = latestHandlers!.handleImportRecordedAudio(
      new File(['voice'], 'voice.webm'),
      { trimStart: 0, trimEnd: 4 },
      target
    );
    track.locked = true;
    await expect(pending).rejects.toThrow();
    expect(deleteProjectAssetMock).toHaveBeenCalledWith('asset-1');
    expect(params.addAssetClip).not.toHaveBeenCalled();
  });
  it('does not insert a recording that finished importing after the editor closed', async () => {
    const { params, target } = setupTarget();
    let finishImport!: (asset: unknown) => void;
    const asset = await importProjectAssetMock();
    importProjectAssetMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishImport = resolve;
        })
    );
    renderHook(params);
    const lifetime = new AbortController();
    const pending = latestHandlers!.handleImportRecordedAudio(
      new File(['voice'], 'voice.webm'),
      { trimStart: 0, trimEnd: 4 },
      target,
      lifetime.signal
    );
    const rejected = expect(pending).rejects.toThrow();
    lifetime.abort();
    finishImport(asset);
    await rejected;
    expect(params.updateProject).not.toHaveBeenCalled();
    expect(deleteProjectAssetMock).toHaveBeenCalledWith('asset-1');
  });
  it.each(['project', 'history'])(
    'cleans the imported copy when %s admission fails',
    async (reason) => {
      const { params, target } = setupTarget();
      if (reason === 'history')
        vi.mocked(params.beginProjectHistoryTransaction).mockReturnValue(null);
      renderHook(params);
      const pending = latestHandlers!.handleImportRecordedAudio(
        new File(['voice'], 'voice.webm'),
        { trimStart: 0, trimEnd: 4 },
        target
      );
      if (reason === 'project') params.getCurrentProjectId = () => 'other';
      await expect(pending).rejects.toThrow();
      expect(deleteProjectAssetMock).toHaveBeenCalledWith('asset-1');
      expect(params.upsertAsset).not.toHaveBeenCalled();
      expect(params.addAssetClip).not.toHaveBeenCalled();
      expect(params.endProjectHistoryTransaction).not.toHaveBeenCalled();
    }
  );
});

it('imports a fresh background privately in one project update without adding a timeline clip', async () => {
  const params = createParams();
  const project = params.getCurrentProject()!;
  const asset = { ...(await importProjectAssetMock()), type: VideoProjectAssetType.IMAGE };
  importProjectAssetMock.mockResolvedValue(asset);
  renderHook(params);
  await act(async () =>
    latestHandlers!.handleImportImage(new File(['image'], 'background.png'), {
      destination: 'background',
    })
  );
  expect(params.updateProject).toHaveBeenCalledOnce();
  const update = vi.mocked(params.updateProject).mock.calls[0]![0];
  const concurrent = {
    ...project,
    name: 'Parallel rename',
    sceneBackground: {
      kind: 'gradient' as const,
      gradient: (
        await import('../../../features/video/project/scene/background-gradient')
      ).createSceneGradientBackground().gradient,
      animation: { mode: 'breathe' as const, speed: 42, intensity: 61 },
      remembered: { solid: { kind: 'solid' as const, color: '#123456' } },
    },
  };
  const next = update(concurrent);
  expect(next.name).toBe('Parallel rename');
  expect(next.sceneBackground?.remembered?.gradient).toMatchObject({
    animation: concurrent.sceneBackground.animation,
  });
  expect(next.sceneBackground?.remembered?.solid?.color).toBe('#123456');
  expect(next.assets).toContainEqual(asset);
  expect(importProjectAssetMock).toHaveBeenCalledWith(
    expect.any(File),
    VideoProjectAssetType.IMAGE,
    { publishToLibrary: false }
  );
  expect(next.sceneBackground).toMatchObject({ kind: 'image', assetId: asset.id });
  expect(next.clips).toEqual(project.clips);
  expect(params.addAssetClip).not.toHaveBeenCalled();
  expect(params.upsertAsset).not.toHaveBeenCalled();
});

it('freezes the current Library background instead of reusing an older project presentation', async () => {
  const params = createParams();
  const project = params.getCurrentProject()!;
  const asset = { ...(await importProjectAssetMock()), type: VideoProjectAssetType.IMAGE };
  project.assets.push({
    ...asset,
    id: 'old-frozen-background',
    source: { kind: 'project-asset', projectAssetId: 'old', originMediaId: 'library-image' },
  });
  importProjectAssetMock.mockResolvedValue(asset);
  importProjectAssetMock.mockClear();
  const file = new File(['new-presentation'], 'background.png', { type: 'image/png' });
  renderHook(params);
  await act(async () =>
    latestHandlers!.handleImportImage(file, {
      destination: 'background',
      backgroundOriginMediaId: 'library-image',
    })
  );
  expect(importProjectAssetMock).toHaveBeenCalledWith(file, VideoProjectAssetType.IMAGE, {
    publishToLibrary: false,
    originMediaId: 'library-image',
  });
  expect(ensureLibraryMediaAssets).not.toHaveBeenCalled();
  const next = vi.mocked(params.updateProject).mock.calls[0]![0](project);
  expect(next.assets.find((item) => item.id === asset.id)?.source).toMatchObject({
    originMediaId: 'library-image',
  });
  expect(next.sceneBackground).toEqual({
    kind: 'image',
    assetId: asset.id,
    remembered: { solid: { kind: 'solid', color: project.backgroundColor } },
  });
});

function watermarkImportFixture() {
  const store = useVideoEditorStore;
  store.setState(store.getInitialState(), true);
  store.getState().setProject(createEmptyVideoProject('Watermark'));
  const params = createParams();
  params.getCurrentProject = () => store.getState().project;
  params.getCurrentProjectId = () => store.getState().project?.id ?? null;
  params.updateProject = vi.fn((updater) => store.getState().updateProject(updater));
  const logo = createVideoProjectAsset(
    'Logo',
    'IMAGE',
    { kind: 'project-asset', projectAssetId: 'private-logo-bytes' },
    {
      width: 400,
      height: 200,
      duration: null,
      mimeType: 'image/png',
      size: 10,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  renderHook(params);
  return { store, params, logo, file: new File(['logo'], 'logo.png', { type: 'image/png' }) };
}

function pendingWatermarkImport() {
  let resolve!: (asset: VideoProjectAsset) => void;
  const promise = new Promise<VideoProjectAsset>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

it.each([false, true])(
  'attaches a private watermark atomically with retainedDisabled=%s and preserves concurrent edits and history',
  async (retainedDisabled) => {
    const { createQuickEditWatermark } =
      await import('../../../features/video/project/scene/watermark');
    const f = watermarkImportFixture();
    if (retainedDisabled)
      f.store.getState().updateProject((current) => ({
        ...current,
        watermark: { ...createQuickEditWatermark('Saved text'), mode: 'text' },
        watermarkEnabled: false,
      }));
    const read = pendingWatermarkImport();
    importProjectAssetMock.mockReturnValueOnce(read.promise);
    const pending = latestHandlers!.handleImportImage(f.file, {
      destination: 'watermark',
      signal: new AbortController().signal,
      watermarkOriginMediaId: 'library-logo',
    });
    const watermark = {
      ...createQuickEditWatermark('Concurrent text'),
      mode: 'text' as const,
      layout: 'tiled' as const,
      tile: { spacing: 0.2, rotation: 45 },
    };
    f.store
      .getState()
      .updateProject((current) => ({ ...current, name: 'Parallel rename', watermark }));
    await act(async () => {
      read.resolve(f.logo);
      await pending;
    });
    const after = f.store.getState().project!;
    expect(after.name).toBe('Parallel rename');
    expect(after.version).toBe(retainedDisabled ? 36 : 20);
    expect(after).not.toHaveProperty('watermarkEnabled');
    expect(after.assets).toEqual([f.logo]);
    expect(after.clips).toEqual([]);
    expect(after.watermark).toMatchObject({
      ...watermark,
      mode: 'image',
      image: { assetId: `project-asset:${f.logo.id}`, width: 400, height: 200 },
    });
    expect(after.watermark?.image?.assetId).not.toBe('project-asset:private-logo-bytes');
    expect(f.params.updateProject).toHaveBeenCalledOnce();
    expect(f.params.upsertAsset).not.toHaveBeenCalled();
    expect(f.params.addAssetClip).not.toHaveBeenCalled();
    expect(importProjectAssetMock).toHaveBeenCalledWith(f.file, 'IMAGE', {
      publishToLibrary: false,
      originMediaId: 'library-logo',
    });
    expect(f.store.getState().projectHistory.past).toHaveLength(retainedDisabled ? 3 : 2);
    const { undoVideoEditorProjectHistory, redoVideoEditorProjectHistory } =
      await import('../../project/history');
    const undo = undoVideoEditorProjectHistory(f.store.getState().projectHistory, after);
    if (undo?.status !== 'applied') throw new Error('Expected undo');
    expect(undo.project.assets).toEqual([]);
    expect(undo.project.watermark).toEqual(watermark);
    expect(undo.project.watermarkEnabled).toBe(retainedDisabled ? false : undefined);
    const redo = redoVideoEditorProjectHistory(undo.history, undo.project);
    if (redo?.status !== 'applied') throw new Error('Expected redo');
    expect(redo.project.watermark).toEqual(after.watermark);
    expect(redo.project.assets).toEqual(after.assets);
  }
);

it('refuses a canceled late logo even after recreation of the same project identity', async () => {
  const f = watermarkImportFixture();
  const controller = new AbortController();
  const read = pendingWatermarkImport();
  importProjectAssetMock.mockReturnValueOnce(read.promise);
  const pending = latestHandlers!.handleImportImage(f.file, {
    destination: 'watermark',
    signal: controller.signal,
  });
  controller.abort();
  f.store.getState().setProject({
    ...createEmptyVideoProject('Restored identity'),
    id: f.store.getState().project!.id,
  });
  const restored = f.store.getState().project;
  await act(async () => {
    read.resolve(f.logo);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
  expect(f.store.getState().project).toBe(restored);
  expect(f.params.updateProject).not.toHaveBeenCalled();
  expect(deleteProjectAssetMock).toHaveBeenCalledExactlyOnceWith('private-logo-bytes');
  expect(toastErrorMock).not.toHaveBeenCalled();
});

it('refuses an invalid imported logo without attachment and accepts a fresh retry', async () => {
  const f = watermarkImportFixture();
  const invalid = { ...f.logo, metadata: { ...f.logo.metadata, width: 5000 } };
  const ready = {
    ...f.logo,
    id: 'retry-logo',
    source: { kind: 'project-asset' as const, projectAssetId: 'retry-private-bytes' },
  };
  importProjectAssetMock.mockResolvedValueOnce(invalid).mockResolvedValueOnce(ready);
  const before = f.store.getState().project;
  await act(async () => {
    await expect(
      latestHandlers!.handleImportImage(f.file, {
        destination: 'watermark',
        signal: new AbortController().signal,
      })
    ).rejects.toThrow('refused');
  });
  expect(f.store.getState().project).toBe(before);
  expect(f.store.getState().projectHistory.past).toHaveLength(0);
  expect(deleteProjectAssetMock).toHaveBeenCalledExactlyOnceWith('private-logo-bytes');
  await act(async () => {
    await latestHandlers!.handleImportImage(f.file, {
      destination: 'watermark',
      signal: new AbortController().signal,
    });
  });
  expect(f.store.getState().project?.assets).toEqual([ready]);
  expect(f.store.getState().project?.watermark?.image?.assetId).toBe('project-asset:retry-logo');
  expect(f.store.getState().projectHistory.past).toHaveLength(1);
  expect(deleteProjectAssetMock).not.toHaveBeenCalledWith('retry-private-bytes');
});

it('refuses an already canceled watermark request before any asset acquisition', async () => {
  const f = watermarkImportFixture();
  importProjectAssetMock.mockClear();
  const controller = new AbortController();
  controller.abort();
  await expect(
    latestHandlers!.handleImportImage(f.file, {
      destination: 'watermark',
      signal: controller.signal,
    })
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(importProjectAssetMock).not.toHaveBeenCalled();
  expect(f.params.updateProject).not.toHaveBeenCalled();
  expect(deleteProjectAssetMock).not.toHaveBeenCalled();
});
