// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectTrack,
} from '../../../features/video/project/factories/creation';
import { VideoProjectAssetType, VideoTrackKind } from '../../../features/video/project/types';
import { useAssetHandlers } from './assets';
import { ensureRecordingAsset } from '../../project/operations/ops';

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
    ensureRecordingAsset: vi.fn(),
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
    upsertAsset: vi.fn(),
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
    'imports recorded audio and reapplies the trimmed selection on the timeline',
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
  expect(params.addAssetClip).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'asset-1' }),
    null,
    8
  );
  expect(params.trimClipStart).toHaveBeenCalledWith('clip-1', 9.5);
  expect(params.moveClip).toHaveBeenCalledWith('clip-1', 8);
  expect(params.trimClipEnd).toHaveBeenCalledWith('clip-1', 10.5);
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
  it('adds the recording to materials without placing any clip', async () => {
    const params = createParams();
    const asset = await importProjectAssetMock();
    vi.mocked(ensureRecordingAsset).mockResolvedValue(asset);
    renderHook(params);
    await act(async () => latestHandlers!.handleAddRecording('recording'));
    expect(params.upsertAsset).toHaveBeenCalledWith(asset);
    expect(params.addAssetClip).not.toHaveBeenCalled();
  });

  it('discards a newly copied recording when the project changes while loading', async () => {
    const params = createParams();
    const asset = await importProjectAssetMock();
    let resolve!: (value: typeof asset) => void;
    vi.mocked(ensureRecordingAsset).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    renderHook(params);
    const pending = latestHandlers!.handleAddRecording('recording');
    params.getCurrentProjectId = () => 'another-project';
    await act(async () => {
      resolve(asset);
      await pending;
    });
    expect(params.upsertAsset).not.toHaveBeenCalled();
    expect(params.addAssetClip).not.toHaveBeenCalled();
    expect(deleteProjectAssetMock).toHaveBeenCalledWith('asset-1');
  });

  it('does not delete an existing recording asset if its project was switched', async () => {
    const params = createParams();
    const asset = await importProjectAssetMock();
    params.getCurrentProject()!.assets.push(asset);
    vi.mocked(ensureRecordingAsset).mockResolvedValue(asset);
    renderHook(params);
    const pending = latestHandlers!.handleAddRecording('recording');
    params.getCurrentProjectId = () => 'another-project';
    await act(async () => pending);
    expect(params.upsertAsset).not.toHaveBeenCalled();
    expect(deleteProjectAssetMock).not.toHaveBeenCalled();
  });
});

describe('recording into an explicit audio track', () => {
  function setupTarget() {
    const params = createParams();
    const project = params.getCurrentProject()!;
    const track = createVideoProjectTrack('Voice', 1, VideoTrackKind.AUDIO);
    project.tracks.push(track);
    return { params, track, target: { projectId: project.id, trackId: track.id, startTime: 7 } };
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
    expect(params.addAssetClip).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'asset-1' }),
      target.trackId,
      7
    );
    expect(params.beginProjectHistoryTransaction).toHaveBeenCalledTimes(1);
    expect(params.endProjectHistoryTransaction).toHaveBeenCalledTimes(1);
    expect(params.trimClipEnd).toHaveBeenCalledWith('clip-1', 10);
  });

  it.each(['missing', 'locked', 'video', 'project'])(
    'rejects a %s target without importing or placing',
    async (reason) => {
      const { params, track, target } = setupTarget();
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
