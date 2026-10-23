import { afterEach, expect, it, vi } from 'vitest';
import { authorizeAudioJob } from './authorization';
import { readVideoProjectTextAudioTarget } from '../../../composition/persistence/projects/text-audio-scope';
import { readVideoProjectAudioSource } from '../../../composition/persistence/projects/audio-source';
import { readVideoWorkspace } from '../../../composition/persistence/review-workspaces/store';
import { readAssetFile } from '../../../composition/persistence/assets/opfs-store';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { addVideoProjectManualText } from '../../../features/video/project/text/authoring';
import { createVideoProjectTextAudioScope } from '../../../features/video/project/text/voice-scope';

vi.mock('../../../composition/persistence/projects/text-audio-scope', () => ({
  readVideoProjectTextAudioTarget: vi.fn(),
}));
vi.mock('../../../composition/persistence/projects/audio-source', () => ({
  readVideoProjectAudioSource: vi.fn(),
}));
vi.mock('../../../composition/persistence/review-workspaces/store', () => ({
  readVideoWorkspace: vi.fn(),
}));
vi.mock('../../../composition/persistence/assets/opfs-store', () => ({ readAssetFile: vi.fn() }));
afterEach(() => vi.resetAllMocks());

async function fixture() {
  const result = addVideoProjectManualText(createEmptyVideoProject('Speech'), {
    documentId: 'script',
    fragmentId: 'phrase',
    start: 0,
  });
  if (!result.ok) throw new Error('Missing text');
  result.entry.document.fragments[0]!.text = 'Authored narration';
  const captured = await createVideoProjectTextAudioScope(result.project, 3, 'script', 'phrase');
  vi.mocked(readVideoProjectTextAudioTarget).mockResolvedValue(captured.basis);
  return {
    type: 'start' as const,
    operation: 'speech' as const,
    requestId: 'request',
    modelId: 'model',
    approvedProviderId: 'provider',
    scope: captured.scope,
    phraseId: captured.basis.fragment.id,
    textRevision: captured.basis.fragment.revision,
    text: captured.basis.fragment.text,
    profile: { voiceId: 'voice', responseFormat: 'mp3' as const },
  };
}

it('admits the canonical authored basis without Gallery or source-byte fallback', async () => {
  const request = await fixture();
  await expect(authorizeAudioJob(request)).resolves.toBeUndefined();
  expect(readVideoProjectTextAudioTarget).toHaveBeenCalledExactlyOnceWith(request.scope);
  vi.mocked(readVideoProjectTextAudioTarget).mockRejectedValueOnce(new Error('stale'));
  await expect(authorizeAudioJob(request)).rejects.toThrow('stale');
  expect(readVideoWorkspace).not.toHaveBeenCalled();
  expect(readVideoProjectAudioSource).not.toHaveBeenCalled();
  expect(readAssetFile).not.toHaveBeenCalled();
});

it.each(['text', 'phraseId', 'textRevision'] as const)(
  'refuses a request whose %s differs from the canonical selection',
  async (field) => {
    const request = await fixture();
    if (field === 'text') request.text = 'Unapproved replacement';
    if (field === 'phraseId') request.phraseId = 'different-phrase';
    if (field === 'textRevision') request.textRevision++;
    await expect(authorizeAudioJob(request)).rejects.toThrow('stale');
    expect(readVideoWorkspace).not.toHaveBeenCalled();
    expect(readVideoProjectAudioSource).not.toHaveBeenCalled();
  }
);

it('refuses undisclosed speech and transcription before canonical text or byte reads', async () => {
  const request = await fixture();
  const { approvedProviderId: _provider, ...unapproved } = request;
  await expect(authorizeAudioJob(unapproved)).rejects.toThrow('unauthorized');
  await expect(
    authorizeAudioJob({
      type: 'start',
      operation: 'transcription',
      requestId: 'request',
      modelId: 'model',
      approvedProviderId: 'provider',
      scope: request.scope,
    })
  ).rejects.toThrow('unauthorized');
  expect(readVideoProjectTextAudioTarget).not.toHaveBeenCalled();
  expect(readVideoWorkspace).not.toHaveBeenCalled();
  expect(readVideoProjectAudioSource).not.toHaveBeenCalled();
  expect(readAssetFile).not.toHaveBeenCalled();
});
