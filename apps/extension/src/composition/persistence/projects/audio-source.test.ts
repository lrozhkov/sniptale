import { beforeEach, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../features/video/project/factories/clip';
import { createVideoProjectAudioScope } from '../../../features/video/project/text/audio-scope';
import type { VideoProjectAssetSource } from '../../../features/video/project/types/model';
import { readVideoProjectAudioSource, readVideoProjectAudioTarget } from './audio-source';

const storage = vi.hoisted(() => ({
  project: vi.fn(),
  asset: vi.fn(),
  library: vi.fn(),
  recording: vi.fn(),
  scenario: vi.fn(),
}));
vi.mock('./index', () => ({ getVideoProject: storage.project, getProjectAsset: storage.asset }));
vi.mock('../media-library/index', () => ({ getMediaAssetBlob: storage.library }));
vi.mock('../recordings/index', () => ({ getRecording: storage.recording }));
vi.mock('../scenario/projects/assets', () => ({ readCommittedScenarioAsset: storage.scenario }));
beforeEach(() => vi.resetAllMocks());

function fixture(
  source: VideoProjectAssetSource = { kind: 'project-asset', projectAssetId: 'owned' }
) {
  const project = createEmptyVideoProject('Recognition');
  const asset = createVideoProjectAsset('Audio source', 'VIDEO', source, {
    width: 640,
    height: 360,
    duration: 10,
    mimeType: 'video/webm',
    hasAudio: true,
    size: 5,
    audioPeaks: null,
  });
  const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 640, 360, 0);
  project.assets = [asset];
  project.clips = [clip];
  const scope = createVideoProjectAudioScope(project, 3, clip.id, 1, 4);
  if (!scope) throw new Error('Missing scope');
  const saved = { status: 'ready', project, workspaceRevision: 3 };
  storage.project.mockResolvedValue(saved);
  return { project, asset, scope, saved };
}
it('reads each canonical member source without accepting caller-supplied resource identities', async () => {
  const file = new File(['audio'], 'source.webm', { type: 'video/webm' });
  const sources: VideoProjectAssetSource[] = [
    { kind: 'project-asset', projectAssetId: 'owned' },
    { kind: 'library-asset', mediaId: 'library' },
    { kind: 'recording', recordingId: 'recording' },
    { kind: 'scenario-asset', scenarioAssetId: 'scenario' },
  ];
  storage.asset.mockResolvedValue({ status: 'ready', entry: { file } });
  storage.library.mockResolvedValue(file);
  storage.recording.mockResolvedValue({ file });
  storage.scenario.mockResolvedValue({ file });
  for (const source of sources) {
    const { scope, asset } = fixture(source);
    await expect(readVideoProjectAudioTarget(scope)).resolves.toEqual(asset);
    await expect(readVideoProjectAudioSource(scope)).resolves.toBe(file);
  }
  expect(storage.asset).toHaveBeenCalledExactlyOnceWith('owned');
  expect(storage.library).toHaveBeenCalledExactlyOnceWith('library');
  expect(storage.recording).toHaveBeenCalledExactlyOnceWith('recording');
  expect(storage.scenario).toHaveBeenCalledExactlyOnceWith('scenario');
});
it('refuses a recreated project identity and changed durable revisions', async () => {
  const { scope, saved } = fixture();
  for (const result of [
    { status: 'notFound' },
    { status: 'invalid' },
    { ...saved, workspaceRevision: 4 },
    { ...saved, project: { ...saved.project, updatedAt: saved.project.updatedAt + 1 } },
    { ...saved, lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1, trashedAt: 2 } },
  ]) {
    storage.project.mockResolvedValueOnce(result);
    await expect(readVideoProjectAudioTarget(scope)).rejects.toThrow('stale');
  }
  storage.project.mockResolvedValueOnce({ ...saved, project: { ...saved.project, clips: [] } });
  await expect(readVideoProjectAudioTarget(scope)).rejects.toThrow('unauthorized');
  expect(storage.asset).not.toHaveBeenCalled();
});
it('refuses missing bytes and rechecks the target after an asynchronous source read', async () => {
  const { scope, saved } = fixture();
  storage.asset.mockResolvedValueOnce({ status: 'not-found' });
  await expect(readVideoProjectAudioSource(scope)).rejects.toThrow('unauthorized');
  let release!: (file: File) => void;
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const reading = new Promise<File>((resolve) => {
    release = resolve;
  });
  storage.asset.mockImplementationOnce(async () => {
    started();
    return { status: 'ready', entry: { file: await reading } };
  });
  const pending = readVideoProjectAudioSource(scope);
  const rejected = expect(pending).rejects.toThrow('stale');
  await entered;
  storage.project.mockResolvedValue({ ...saved, workspaceRevision: 4 });
  release(new File(['audio'], 'source.webm'));
  await rejected;
});

it('refuses unavailable source backends and a changed member after byte resolution', async () => {
  const sources: VideoProjectAssetSource[] = [
    { kind: 'library-asset', mediaId: 'library' },
    { kind: 'recording', recordingId: 'recording' },
    { kind: 'scenario-asset', scenarioAssetId: 'scenario' },
  ];
  storage.library.mockResolvedValue(null);
  storage.recording.mockResolvedValue(null);
  storage.scenario.mockResolvedValue(null);
  for (const source of sources) {
    const { scope } = fixture(source);
    await expect(readVideoProjectAudioSource(scope)).rejects.toThrow('unauthorized');
  }
  const { scope, saved, asset } = fixture();
  storage.asset.mockRejectedValueOnce(new Error('private storage detail'));
  await expect(readVideoProjectAudioSource(scope)).rejects.toThrow('unauthorized');
  storage.project.mockResolvedValueOnce(saved).mockResolvedValueOnce({
    ...saved,
    project: { ...saved.project, assets: [{ ...asset, name: 'Changed' }] },
  });
  storage.asset.mockResolvedValueOnce({
    status: 'ready',
    entry: { file: new File(['audio'], 'source.webm') },
  });
  await expect(readVideoProjectAudioSource(scope)).rejects.toThrow('stale');
});
