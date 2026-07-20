// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVideoClipFromAsset } from '../../../features/video/project/factories/clip';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../features/video/project/factories/creation';
import { VideoProjectAssetType, VideoTrackKind } from '../../../features/video/project/types';
import { useCursorDetectionAnalysis, type VideoEditorCursorDetectionController } from './analysis';

const {
  loadVideoEditorAssetUrlMock,
  onSelectObjectTrackMock,
  onUpsertObjectTrackMock,
  revokeVideoEditorAssetUrlMock,
  runCursorDetectionJobMock,
} = vi.hoisted(() => ({
  loadVideoEditorAssetUrlMock: vi.fn(),
  onSelectObjectTrackMock: vi.fn(),
  onUpsertObjectTrackMock: vi.fn(),
  revokeVideoEditorAssetUrlMock: vi.fn(),
  runCursorDetectionJobMock: vi.fn(),
}));

vi.mock('./job', () => ({
  runCursorDetectionJob: runCursorDetectionJobMock,
}));
vi.mock('../session/asset-urls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session/asset-urls')>()),
  loadVideoEditorAssetUrl: loadVideoEditorAssetUrlMock,
  revokeVideoEditorAssetUrl: revokeVideoEditorAssetUrlMock,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let controller: VideoEditorCursorDetectionController | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  controller = null;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

function CursorDetectionHarness() {
  return <CursorDetectionHarnessWithAssetUrls assetUrls={null} />;
}

function CursorDetectionHarnessWithAssetUrls(props: { assetUrls: Record<string, string> | null }) {
  const project = createProject();
  controller = useCursorDetectionAnalysis({
    assetUrls: props.assetUrls ?? { [project.assets[0]?.id ?? 'asset']: 'blob:video' },
    currentTime: 0,
    onSelectObjectTrack: onSelectObjectTrackMock,
    onUpsertObjectTrack: onUpsertObjectTrackMock,
    project,
    selectedClipId: project.clips[0]?.id ?? null,
  });
  return null;
}

function createProject() {
  const project = createEmptyVideoProject('Cursor detection');
  const trackId = project.tracks.find((track) => track.kind === VideoTrackKind.PRIMARY)?.id;
  const asset = createVideoProjectAsset(
    'Video',
    VideoProjectAssetType.VIDEO,
    { kind: 'project-asset', projectAssetId: 'asset' },
    {
      audioPeaks: null,
      duration: 5,
      hasAudio: false,
      height: 720,
      mimeType: 'video/webm',
      size: 100,
      width: 1280,
    }
  );
  project.assets.push(asset);
  project.clips.push(createVideoClipFromAsset(trackId ?? 'video', asset, 1280, 720, 0));
  return project;
}

describe('useCursorDetectionAnalysis', () => {
  it('does not start pixel analysis when the editor controller mounts', () => {
    act(() => {
      root?.render(<CursorDetectionHarness />);
    });

    expect(controller?.selectedClipAvailability).toEqual({ canRun: true, reason: null });
    expect(runCursorDetectionJobMock).not.toHaveBeenCalled();
  });

  it('resolves the selected clip asset URL on demand before running pixel analysis', async () => {
    loadVideoEditorAssetUrlMock.mockImplementation(async (asset: { id: string }) => [
      asset.id,
      'blob:on-demand-video',
    ]);
    runCursorDetectionJobMock.mockResolvedValue({ id: 'visual-cursor-track', samples: [] });

    act(() => {
      root?.render(<CursorDetectionHarnessWithAssetUrls assetUrls={{}} />);
    });

    await act(async () => {
      await controller?.runForSelectedClip();
    });

    const loadedAssetId = loadVideoEditorAssetUrlMock.mock.calls[0]?.[0]?.id;
    if (!loadedAssetId) {
      throw new Error('Expected cursor detection to load the selected clip asset.');
    }
    expect(runCursorDetectionJobMock.mock.calls[0]?.[0]?.assetUrls[loadedAssetId]).toBe(
      'blob:on-demand-video'
    );
    expect(revokeVideoEditorAssetUrlMock).toHaveBeenCalledWith('blob:on-demand-video');
  });
});

describe('useCursorDetectionAnalysis hidden tracks', () => {
  it('upserts hidden camera cursor tracks without selecting an object track', async () => {
    runCursorDetectionJobMock.mockResolvedValue({
      hidden: true,
      id: 'visual-cursor',
      kind: 'visualCursor',
      role: 'cameraCursor',
      samples: [],
      source: 'visualDetection',
    });

    act(() => {
      root?.render(<CursorDetectionHarness />);
    });

    await act(async () => {
      await controller?.runForSelectedClip();
    });

    expect(onUpsertObjectTrackMock).toHaveBeenCalledWith(
      expect.objectContaining({ hidden: true, role: 'cameraCursor' })
    );
    expect(onSelectObjectTrackMock).not.toHaveBeenCalled();
  });
});
