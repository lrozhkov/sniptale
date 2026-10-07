import { beforeEach, expect, it, vi } from 'vitest';
import { authorizeAudioJob } from './authorization';
import { readVideoWorkspace } from '../../../composition/persistence/review-workspaces/store';
import { getProjectAsset } from '../../../composition/persistence/projects';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import type { VideoWorkspace } from '../../../composition/persistence/review-workspaces/contracts';
import type { AudioJobStart } from '../../../contracts/ai/audio';
vi.mock('../../../composition/persistence/review-workspaces/store', () => ({
  readVideoWorkspace: vi.fn(),
}));
vi.mock('../../../composition/persistence/projects', () => ({
  getProjectAsset: vi.fn(async () => ({ status: 'ready' })),
}));

const request: AudioJobStart = {
  type: 'start',
  requestId: 'r',
  operation: 'speech',
  modelId: 'model',
  scope: {
    workspaceId: 'w',
    workspaceRevision: 1,
    clipId: 'clip',
    assetId: 'project-asset:a',
    nativeStart: 0,
    nativeEnd: 1,
  },
  phraseId: 'phrase',
  textRevision: 1,
  text: 'hello',
  profile: { voiceId: 'voice', responseFormat: 'mp3' },
};
let workspace: VideoWorkspace;
beforeEach(() => {
  vi.clearAllMocks();
  const advanced = createQuickEditAdvancedState();
  advanced.audio.voiceover = [
    {
      id: 'clip',
      assetId: 'project-asset:a',
      timelineStart: 0,
      sourceOffset: 0,
      duration: 4,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
      transcript: {
        version: 1,
        replacements: [],
        phrases: [
          {
            id: 'phrase',
            start: 0,
            end: 1,
            originalText: 'hello',
            text: 'hello',
            revision: 1,
            alignment: 'range',
          },
        ],
      },
    },
  ];
  workspace = {
    aggregateId: 'w',
    formatVersion: 1,
    revision: 1,
    sourceAssetId: 'root',
    source: { duration: 4, width: 10, height: 10, mimeType: 'video/webm', size: 10 },
    advanced,
    history: [],
    cursor: 0,
    createdAt: 1,
    updatedAt: 1,
  };
  vi.mocked(readVideoWorkspace).mockImplementation(async () => ({ workspace, draft: null }));
});

it('admits exact saved phrase and checks that its bytes still exist', async () => {
  await expect(authorizeAudioJob(request)).resolves.toBeUndefined();
  expect(getProjectAsset).toHaveBeenCalledWith('a');
  vi.mocked(getProjectAsset).mockResolvedValueOnce({ status: 'not-found' });
  await expect(authorizeAudioJob(request)).rejects.toThrow('unauthorized');
});
it('rejects disappeared or revision-changed workspaces before reading asset bytes', async () => {
  vi.mocked(readVideoWorkspace).mockResolvedValueOnce(null);
  await expect(authorizeAudioJob(request)).rejects.toThrow('stale');
  workspace.revision = 2;
  await expect(authorizeAudioJob(request)).rejects.toThrow('stale');
  expect(getProjectAsset).not.toHaveBeenCalled();
});
it('rejects deleted clips and mismatched source locators', async () => {
  await expect(
    authorizeAudioJob({ ...request, scope: { ...request.scope, clipId: 'deleted' } })
  ).rejects.toThrow('unauthorized');
  await expect(
    authorizeAudioJob({ ...request, scope: { ...request.scope, assetId: 'another' } })
  ).rejects.toThrow('unauthorized');
  workspace.advanced.audio.voiceover[0]!.assetId = 'unsupported';
  await expect(
    authorizeAudioJob({ ...request, scope: { ...request.scope, assetId: 'unsupported' } })
  ).rejects.toThrow('unauthorized');
  expect(getProjectAsset).not.toHaveBeenCalled();
});
it.each([
  { phraseId: 'missing' },
  { text: 'edited' },
  { textRevision: 2 },
  { scope: { ...request.scope, nativeStart: 0.1 } },
  { scope: { ...request.scope, nativeEnd: 1.1 } },
])('rejects a changed phrase request before synthesis: %j', async (change) => {
  await expect(authorizeAudioJob({ ...request, ...change })).rejects.toThrow('stale');
});
it('rejects missing transcript and native gaps rather than uploading another slice', async () => {
  const clip = workspace.advanced.audio.voiceover[0]!;
  delete clip.transcript;
  await expect(authorizeAudioJob(request)).rejects.toThrow('stale');
  clip.sourceAnchor = [{ start: 1, end: 2, offset: 1, duration: 1 }];
  await expect(authorizeAudioJob(request)).rejects.toThrow('unauthorized');
});
