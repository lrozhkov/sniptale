import { expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../features/video/project/factories/creation';
import { createAudioClipFromAsset } from '../../../features/video/project/factories/clip';
import { createVideoProjectAudioScope } from '../../../features/video/project/text/audio-scope';
import { readVideoProjectAudioSource } from './audio-source';

const storage = vi.hoisted(() => ({
  project: vi.fn(),
  get: vi.fn(),
  file: vi.fn(),
  recover: vi.fn(),
}));
vi.mock('./index', () => ({ getVideoProject: storage.project, getProjectAsset: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: async () => ({ get: storage.get }),
}));
vi.mock('../assets', async (original) => ({
  ...(await original<typeof import('../assets')>()),
  readAssetFile: storage.file,
}));
vi.mock('../scenario/aggregate-mutations', () => ({
  recoverScenarioAssetPublications: storage.recover,
}));

it('admits committed Scenario bytes through the real reader without running publication recovery', async () => {
  const file = new File(['audio'], 'source.wav', { type: 'audio/wav' });
  const project = createEmptyVideoProject('Audio');
  const asset = createVideoProjectAsset(
    'Scenario audio',
    'AUDIO',
    { kind: 'scenario-asset', scenarioAssetId: 'scenario-source' },
    {
      width: 0,
      height: 0,
      duration: 10,
      hasAudio: true,
      mimeType: file.type,
      size: file.size,
      audioPeaks: null,
    }
  );
  const clip = createAudioClipFromAsset(project.tracks[0]!.id, asset, 0);
  project.assets = [asset];
  project.clips = [clip];
  const scope = createVideoProjectAudioScope(project, 3, clip.id, 0, 1);
  if (!scope) throw new Error('Missing scope');
  storage.project.mockResolvedValue({ status: 'ready', project, workspaceRevision: 3 });
  storage.recover.mockRejectedValue(new Error('Unrelated pending publication failed'));
  storage.get.mockImplementation(async (store: string) =>
    store === 'scenario_assets'
      ? {
          assetId: 'object',
          id: 'scenario-source',
          projectId: 'scenario',
          galleryAssetId: null,
          mimeType: file.type,
          width: 0,
          height: 0,
          duration: 10,
          createdAt: 1,
          size: file.size,
        }
      : {
          assetId: 'object',
          createdAt: 1,
          location: { kind: 'opfs', objectKey: 'objects/object' },
          mimeType: file.type,
          size: file.size,
          sha256: null,
        }
  );
  storage.file.mockResolvedValue(file);
  await expect(readVideoProjectAudioSource(scope)).resolves.toBe(file);
  expect(storage.recover).not.toHaveBeenCalled();
  expect(storage.get.mock.calls.map(([store]) => store)).toEqual(['scenario_assets', 'asset_refs']);
});
