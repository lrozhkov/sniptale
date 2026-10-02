// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectTrack,
} from '../../../features/video/project/factories/creation';
import { VideoTrackKind, VideoProjectAssetType } from '../../../features/video/project/types';
import { useAssetHandlers } from './assets';
import { publishVideoEditorSaveReadiness } from '../session/save-readiness';

const importAsset = vi.hoisted(() => vi.fn());
vi.mock('../../project/operations/ops', async (original) => ({
  ...(await original<typeof import('../../project/operations/ops')>()),
  importProjectAsset: importAsset,
}));
let root: ReturnType<typeof createRoot>;
const host = document.createElement('div');
afterEach(() => {
  act(() => root?.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it('retries a failed authoritative recording save without a second asset, clip or history entry', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  document.body.append(host);
  const project = createEmptyVideoProject('Voice');
  const track = createVideoProjectTrack('Voice', 1, VideoTrackKind.AUDIO);
  project.tracks.push(track);
  project.duration = 20;
  importAsset.mockResolvedValue({
    id: 'asset-1',
    type: VideoProjectAssetType.AUDIO,
    name: 'voice.wav',
    source: { kind: 'project-asset', projectAssetId: 'asset-1' },
    metadata: {
      width: 0,
      height: 0,
      duration: 6,
      mimeType: 'audio/wav',
      size: 1,
      hasAudio: true,
      audioPeaks: null,
    },
  });
  const port: Parameters<typeof useAssetHandlers>[0] = {
    beginProjectHistoryTransaction: vi.fn(() => Symbol()),
    endProjectHistoryTransaction: vi.fn(),
    getCurrentProject: () => project,
    getCurrentProjectId: () => project.id,
    getCurrentTime: () => 7,
    addAssetClip: vi.fn(() => 'clip-1'),
    moveClip: vi.fn(),
    setError: vi.fn(),
    trimClipEnd: vi.fn(),
    trimClipStart: vi.fn(),
    upsertAsset: vi.fn(),
    upsertAssets: vi.fn(),
    updateProject: vi.fn((updater) => {
      Object.assign(project, updater(project));
      publishVideoEditorSaveReadiness({ projectId: project.id, saveState: 'dirty' });
      publishVideoEditorSaveReadiness({ projectId: project.id, saveState: 'error' });
    }),
  };
  let handlers: ReturnType<typeof useAssetHandlers> | null = null;
  function Harness() {
    handlers = useAssetHandlers(port);
    return null;
  }
  root = createRoot(host);
  act(() => root.render(<Harness />));
  const target = { projectId: project.id, trackId: track.id, startTime: 7, endTime: 20 };
  const take = new Blob(['voice']);
  const file = new File(['trimmed'], 'voice.wav');
  const signal = new AbortController().signal;
  await act(async () => {
    await expect(
      handlers!.handleImportRecordedAudio(file, { trimStart: 1, trimEnd: 4 }, target, signal, take)
    ).rejects.toThrow('could not be saved');
  });
  expect(project.clips).toHaveLength(1);
  const clipId = project.clips[0]!.id;
  await act(async () => {
    const retry = handlers!.handleImportRecordedAudio(
      file,
      { trimStart: 1, trimEnd: 4 },
      target,
      signal,
      take
    );
    publishVideoEditorSaveReadiness({ projectId: project.id, saveState: 'dirty' });
    publishVideoEditorSaveReadiness({ projectId: project.id, saveState: 'saved' });
    await retry;
  });
  expect(importAsset).toHaveBeenCalledOnce();
  expect(port.updateProject).toHaveBeenCalledOnce();
  expect(port.beginProjectHistoryTransaction).toHaveBeenCalledOnce();
  expect(project.clips).toHaveLength(1);
  expect(project.clips[0]!.id).toBe(clipId);
  expect(project.assets.filter((asset) => asset.id === 'asset-1')).toHaveLength(1);
});
