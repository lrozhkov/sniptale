import { beforeEach, expect, it, vi } from 'vitest';
import { createRecognitionFixture as fixture } from './recognition.test-support';
import { prepareReviewRecognition, runReviewRecognition } from './recognition';

const remote = vi.hoisted(() => ({
  job: vi.fn(),
  extract: vi.fn(async () => new Blob(['pcm'])),
  plan: vi.fn(),
}));
vi.mock('./speech-client', () => ({ runReviewSpeechJob: remote.job }));
vi.mock('./speech-audio', () => ({
  extractReviewSpeechWav: remote.extract,
  planReviewSpeechChunks: remote.plan,
  reviewSpeechWavIsSilent: async () => false,
}));
const signal = () => new AbortController().signal;
const original = { file: new Blob(['source']), sourceAssetId: 'source' };
const prepare = (session: ReturnType<typeof fixture>['session'], options = {}) =>
  prepareReviewRecognition(session, { kind: 'original' }, 'model', 'provider', signal(), {
    original,
    ...options,
  });
beforeEach(() => vi.clearAllMocks());

it('sends one whole native multimodal range and retains verbatim provenance', async () => {
  const { session } = fixture(330.425);
  const options = { mode: 'rewrite' as const, granularity: 'sentence' as const, prompt: 'Concise' };
  const job = await prepare(session, { recognition: options });
  expect(job.chunks).toEqual([{ start: 0, end: 330.425, range: 0 }]);
  expect(remote.plan).not.toHaveBeenCalled();
  remote.job.mockResolvedValue({
    type: 'transcript',
    result: {
      text: 'New.',
      segments: [{ text: 'New.', originalText: 'Original words.', start: 2, end: 5 }],
    },
  });
  const proposal = await runReviewRecognition(session, job, signal());
  expect(remote.job).toHaveBeenCalledTimes(1);
  expect(remote.job.mock.calls[0]![0]).toMatchObject({
    recognition: options,
    scope: { nativeStart: 0, nativeEnd: 330.425 },
  });
  expect(proposal.document.fragments[0]).toMatchObject({
    text: 'New.',
    originalText: 'Original words.',
    start: 2,
    end: 5,
    alignment: 'segment',
    timeDomain: 'source',
  });
  const changed = await prepare(session, {
    recognition: { ...options, prompt: 'Different' },
    previous: job,
  });
  expect(changed.id).not.toBe(job.id);
  expect(changed.chunks[0]?.result).toBeUndefined();
});
it('rejects oversized whole multimodal audio before planning, extraction or paid requests', async () => {
  const { session, deps } = fixture(1000);
  await expect(
    prepare(session, { recognition: { mode: 'transcribe', granularity: 'phrase', prompt: '' } })
  ).rejects.toThrow('too-large');
  expect(remote.plan).not.toHaveBeenCalled();
  expect(remote.extract).not.toHaveBeenCalled();
  expect(remote.job).not.toHaveBeenCalled();
  expect(deps.saveVideoWorkspaceDraft).not.toHaveBeenCalled();
});

it('keeps verbatim wording when a multimodal correction is projected from a voice clip', async () => {
  const { session } = fixture(10);
  const advanced = session.getSnapshot().snapshot.workspace.advanced;
  const clip = {
    id: 'clip',
    assetId: 'project-asset:voice',
    timelineStart: 1,
    sourceOffset: 3,
    duration: 6,
    tempo: 2,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  };
  await session.saveAdvanced({ ...advanced, audio: { ...advanced.audio, voiceover: [clip] } });
  const job = await prepareReviewRecognition(
    session,
    { kind: 'voiceover', clipId: clip.id },
    'model',
    'provider',
    signal(),
    { recognition: { mode: 'rewrite', granularity: 'paragraph', prompt: 'Concise.' } }
  );
  remote.job.mockResolvedValueOnce({
    type: 'transcript',
    result: {
      text: 'New.',
      segments: [{ text: 'New.', originalText: 'Original words.', start: 2, end: 5 }],
    },
  });
  const proposal = await runReviewRecognition(session, job, signal());
  expect(proposal.document.fragments[0]).toMatchObject({
    text: 'New.',
    originalText: 'Original words.',
    start: 2,
    end: 3.5,
    timeDomain: 'result',
    origin: { kind: 'voiceover', clipId: 'clip', start: 5, end: 8 },
  });
});
