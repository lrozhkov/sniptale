import { afterEach, expect, it, vi } from 'vitest';
import { authorizeAudioJob } from './authorization';
import { readVideoProjectAudioSource } from '../../../composition/persistence/projects/audio-source';
import { readVideoWorkspace } from '../../../composition/persistence/review-workspaces/store';
import type { AudioJobStart } from '../../../contracts/ai/audio';
vi.mock('../../../composition/persistence/projects/audio-source', () => ({
  readVideoProjectAudioSource: vi.fn(),
}));
vi.mock('../../../composition/persistence/review-workspaces/store', () => ({
  readVideoWorkspace: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());
const request: AudioJobStart = {
  type: 'start',
  operation: 'transcription',
  requestId: 'request',
  modelId: 'model',
  approvedProviderId: 'provider',
  scope: {
    projectId: 'project',
    projectRevision: 3,
    projectUpdatedAt: 10,
    target: { kind: 'project-clip', clipId: 'clip' },
    assetId: 'asset',
    nativeStart: 1,
    nativeEnd: 3,
  },
};
it('requires canonical project source admission and never falls back to a Gallery workspace', async () => {
  vi.mocked(readVideoProjectAudioSource).mockResolvedValue(new Blob(['audio']));
  await expect(authorizeAudioJob(request)).resolves.toBeUndefined();
  expect(readVideoProjectAudioSource).toHaveBeenCalledExactlyOnceWith(request.scope);
  expect(readVideoWorkspace).not.toHaveBeenCalled();
  vi.mocked(readVideoProjectAudioSource).mockRejectedValueOnce(new Error('stale'));
  await expect(authorizeAudioJob(request)).rejects.toThrow('stale');
  expect(readVideoWorkspace).not.toHaveBeenCalled();
});
it('refuses project speech and undisclosed transcription before source access', async () => {
  const undisclosed = { ...request };
  delete undisclosed.approvedProviderId;
  await expect(authorizeAudioJob(undisclosed)).rejects.toThrow('unauthorized');
  await expect(
    authorizeAudioJob({
      ...request,
      operation: 'speech',
      phraseId: 'phrase',
      textRevision: 0,
      text: 'Text',
      profile: { voiceId: 'voice', responseFormat: 'mp3' },
    })
  ).rejects.toThrow('unauthorized');
  expect(readVideoProjectAudioSource).not.toHaveBeenCalled();
});
