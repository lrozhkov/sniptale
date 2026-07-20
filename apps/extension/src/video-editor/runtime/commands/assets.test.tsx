// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { VideoProjectAssetType } from '../../../features/video/project/types';
import { useAssetHandlers } from './assets';

const { deleteProjectAssetMock, importProjectAssetMock } = vi.hoisted(() => ({
  deleteProjectAssetMock: vi.fn(),
  importProjectAssetMock: vi.fn(),
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

function createParams(): Parameters<typeof useAssetHandlers>[0] {
  const project = createEmptyVideoProject('Recorded audio');
  return {
    project,
    getCurrentProjectId: () => project.id,
    currentTime: 5,
    projects: [],
    exportState: {
      dialogOpen: false,
      isRunning: false,
      jobId: null,
      status: null,
      settings: null,
      error: null,
      lastResult: null,
    },
    libraries: {
      projects: [],
      projectExports: [],
      recordings: [],
      refreshProjectExports: vi.fn().mockResolvedValue(undefined),
      refreshProjects: vi.fn().mockResolvedValue(undefined),
      refreshRecordings: vi.fn().mockResolvedValue(undefined),
    },
    addAssetClip: vi.fn(() => 'clip-1'),
    applyLoadedProject: vi.fn(),
    cancelExport: vi.fn(),
    failExportCancellation: vi.fn(),
    failExport: vi.fn(),
    moveClip: vi.fn(),
    setError: vi.fn(),
    startExport: vi.fn(),
    trimClipEnd: vi.fn(),
    trimClipStart: vi.fn(),
    upsertAsset: vi.fn(),
  };
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
    5
  );
  expect(params.trimClipStart).toHaveBeenCalledWith('clip-1', 6.5);
  expect(params.moveClip).toHaveBeenCalledWith('clip-1', 5);
  expect(params.trimClipEnd).toHaveBeenCalledWith('clip-1', 7.5);
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
