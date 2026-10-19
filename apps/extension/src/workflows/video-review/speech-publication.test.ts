import { beforeEach, expect, it, vi } from 'vitest';
import {
  applyReviewSpeech,
  generateReviewSpeech,
  cleanupReviewSpeechPreview,
  reviewSpeechGeometry,
  type ReviewSpeechPreview,
  type ReviewSpeechSession,
} from './speech-publication';
import { reviewSpeechTextSignature } from '../../features/video/review/speech-transcript';
const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  job: vi.fn(),
  read: vi.fn(),
  discard: vi.fn(async () => undefined),
  decode: vi.fn(),
}));
vi.mock('../../composition/persistence/projects', () => ({ prepareProjectAsset: mocks.prepare }));
vi.mock('../../composition/persistence/projects/voiceover-publication-lock', () => ({
  withVoiceoverAttachmentLock: (_id: string, fn: () => Promise<void>) => fn(),
}));
vi.mock('../audio-jobs/client', () => ({ runReviewSpeechJob: mocks.job }));
vi.mock('./speech-audio', () => ({ decodeReviewSpeechDuration: mocks.decode }));
vi.mock('../../composition/persistence/assets/audio-staging', () => ({
  readAudioStaging: mocks.read,
  discardAudioStaging: mocks.discard,
}));
const profile = { modelId: 'm', voiceId: 'v', responseFormat: 'wav' as const };
function fixture() {
  const phrase = {
    id: 'phrase',
    start: 0,
    end: 2,
    text: 'Hello',
    originalText: 'Hello',
    revision: 0,
    alignment: 'range' as const,
  };
  const transcript = { version: 1 as const, phrases: [phrase], replacements: [], profile };
  const clip = { id: 'clip', assetId: 'original', transcript };
  const state = {
    document: { edits: [], advancedContent: { audio: { voiceover: [clip] } } },
    snapshot: { workspace: { aggregateId: 'workspace' } },
  };
  const commitDurable = vi.fn(async () => undefined);
  const hasDurableSpeechAsset = vi.fn(async () => false);
  const session = {
    getSnapshot: () => state,
    flush: async () => undefined,
    commitDurable,
    saveSpeechTranscript: commitDurable,
    hasDurableSpeechAsset,
    createSpeechPublicationReceipt: () => ({ id: crypto.randomUUID(), at: Date.now() }),
    publishSpeechTranscripts: commitDurable,
    recoverSpeechPublication: async () => {
      await hasDurableSpeechAsset();
      return false;
    },
  } as unknown as ReviewSpeechSession;
  const preview: ReviewSpeechPreview = {
    blob: new Blob(['audio'], { type: 'audio/wav' }),
    url: 'blob:preview',
    createdAt: Date.now(),
    expiresAt: Date.now() + 600000,
    geometry: reviewSpeechGeometry(session, { kind: 'voiceover', clipId: 'clip' }),
    scope: {
      workspaceId: 'workspace',
      workspaceRevision: 1,
      target: { kind: 'voiceover', clipId: 'clip' },
      assetId: 'original',
      nativeStart: 0,
      nativeEnd: 2,
    },
    staged: { id: 'preview', mimeType: 'audio/wav', size: 5 },
    replacement: {
      ...phrase,
      phraseId: phrase.id,
      duration: 1,
      assetId: 'project-asset:preview',
      profile,
      textSignature: reviewSpeechTextSignature(phrase.text, profile),
    },
  };
  return { session, preview, commitDurable, hasDurableSpeechAsset, clip };
}
beforeEach(() => mocks.prepare.mockReset());
it('never stages overflow, avoiding durable bytes for an unappliable generation', async () => {
  const { session, preview } = fixture();
  preview.replacement.duration = 3;
  await expect(
    applyReviewSpeech(
      session,
      { kind: 'voiceover', clipId: 'clip' },
      [preview],
      new AbortController().signal
    )
  ).rejects.toThrow('duration');
  expect(mocks.prepare).not.toHaveBeenCalled();
});
it('keeps ready bytes when attachment durability is ambiguous', async () => {
  const { session, preview, commitDurable, hasDurableSpeechAsset } = fixture();
  const asset = {
    id: 'generated',
    protect: vi.fn(async () => undefined),
    publish: vi.fn(),
    cancel: vi.fn(),
  };
  mocks.prepare.mockResolvedValue(asset);
  commitDurable.mockRejectedValue(new Error('commit failed'));
  hasDurableSpeechAsset.mockRejectedValue(new Error('read failed'));
  await expect(
    applyReviewSpeech(
      session,
      { kind: 'voiceover', clipId: 'clip' },
      [preview],
      new AbortController().signal
    )
  ).rejects.toThrow('commit failed');
  expect(asset.cancel).not.toHaveBeenCalled();
  expect(asset.publish).not.toHaveBeenCalled();
});
it('cancels prepared private assets after a proven unattached failure', async () => {
  const { session, preview, commitDurable } = fixture();
  const asset = {
    id: 'generated',
    protect: vi.fn(async () => undefined),
    publish: vi.fn(),
    cancel: vi.fn(),
  };
  mocks.prepare.mockResolvedValue(asset);
  commitDurable.mockRejectedValue(new Error('commit failed'));
  await expect(
    applyReviewSpeech(
      session,
      { kind: 'voiceover', clipId: 'clip' },
      [preview],
      new AbortController().signal
    )
  ).rejects.toThrow('commit failed');
  expect(asset.cancel).toHaveBeenCalledOnce();
  expect(mocks.prepare.mock.calls[0]?.[6]).toEqual({
    publishToLibrary: false,
    requiredReviewSpeech: {
      aggregateId: 'workspace',
      target: { kind: 'voiceover', clipId: 'clip' },
      replacementId: preview.replacement.id,
    },
  });
});

it('rejects expired preview before staging durable bytes', async () => {
  const { session, preview } = fixture();
  preview.expiresAt = Date.now() - 1;
  await expect(
    applyReviewSpeech(
      session,
      { kind: 'voiceover', clipId: 'clip' },
      [preview],
      new AbortController().signal
    )
  ).rejects.toThrow('stale');
  expect(mocks.prepare).not.toHaveBeenCalled();
});

it('publishes only after durable attachment and retains bytes if final publication fails', async () => {
  for (const failPublish of [false, true]) {
    const { session, preview, commitDurable } = fixture();
    const events: string[] = [];
    commitDurable.mockImplementation(async () => {
      events.push('commit');
    });
    const asset = {
      id: 'generated',
      protect: vi.fn(async () => {
        events.push('protect');
      }),
      publish: vi.fn(async () => {
        events.push('publish');
        if (failPublish) throw new Error('publish failed');
      }),
      cancel: vi.fn(),
    };
    mocks.prepare.mockResolvedValue(asset);
    const pending = applyReviewSpeech(
      session,
      { kind: 'voiceover', clipId: 'clip' },
      [preview],
      new AbortController().signal
    );
    if (failPublish) await expect(pending).rejects.toThrow('publish failed');
    else await pending;
    expect(events).toEqual(['protect', 'commit', 'publish']);
    expect(asset.cancel).not.toHaveBeenCalled();
  }
});
it('does not attach output after geometry changes during staging', async () => {
  const { session, preview, clip, commitDurable } = fixture();
  const asset = {
    id: 'generated',
    protect: vi.fn(async () => {
      clip.assetId = 'changed';
    }),
    publish: vi.fn(),
    cancel: vi.fn(),
  };
  mocks.prepare.mockResolvedValue(asset);
  await expect(
    applyReviewSpeech(
      session,
      { kind: 'voiceover', clipId: 'clip' },
      [preview],
      new AbortController().signal
    )
  ).rejects.toThrow('stale');
  expect(commitDurable).not.toHaveBeenCalled();
  expect(asset.cancel).toHaveBeenCalledOnce();
});
it('creates a decoded preview without publishing and discards it explicitly', async () => {
  const { session, preview } = fixture();
  mocks.job.mockResolvedValue({ type: 'audio', staged: preview.staged });
  mocks.read.mockResolvedValue(preview.blob);
  mocks.decode.mockResolvedValue(1.25);
  const generated = await generateReviewSpeech(
    session,
    { kind: 'voiceover', clipId: 'clip' },
    'phrase',
    profile,
    new AbortController().signal
  );
  expect(generated.replacement.duration).toBe(1.25);
  expect(generated.url.startsWith('blob:')).toBe(true);
  expect(generated.expiresAt - generated.createdAt).toBe(600000);
  expect(mocks.prepare).not.toHaveBeenCalled();
  await cleanupReviewSpeechPreview(generated);
  expect(mocks.discard).toHaveBeenCalledWith(preview.staged, generated.scope);
});
it('discards decoded output if cancellation arrives while decoding', async () => {
  const { session, preview } = fixture();
  const controller = new AbortController();
  mocks.job.mockResolvedValue({ type: 'audio', staged: preview.staged });
  mocks.read.mockResolvedValue(preview.blob);
  mocks.decode.mockImplementationOnce(async () => {
    controller.abort();
    return 1;
  });
  await expect(
    generateReviewSpeech(
      session,
      { kind: 'voiceover', clipId: 'clip' },
      'phrase',
      profile,
      controller.signal
    )
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(mocks.discard).toHaveBeenCalledWith(preview.staged, expect.anything());
});
it('rejects missing phrase and provider output that is not audio', async () => {
  const { session } = fixture();
  await expect(
    generateReviewSpeech(
      session,
      { kind: 'voiceover', clipId: 'clip' },
      'missing',
      profile,
      new AbortController().signal
    )
  ).rejects.toThrow('stale');
  mocks.job.mockResolvedValueOnce({ type: 'transcript', result: { text: 'Wrong operation' } });
  await expect(
    generateReviewSpeech(
      session,
      { kind: 'voiceover', clipId: 'clip' },
      'phrase',
      profile,
      new AbortController().signal
    )
  ).rejects.toThrow('invalid-response');
});

it('applies original speech once with exact private claims and no manual gain mutation', async () => {
  const { createQuickEditAdvancedState } =
    await import('../../features/video/review/advanced/defaults');
  const { session: voice, preview } = fixture();
  const advanced = createQuickEditAdvancedState();
  advanced.audio.original.volume = 0.6;
  advanced.audio.originalSpeech = {
    enabled: false,
    transcript: {
      ...voice.getSnapshot().document.advancedContent.audio.voiceover[0]!.transcript!,
      replacements: [],
    },
  };
  const state = {
    snapshot: {
      workspace: { aggregateId: 'workspace', sourceAssetId: 'original', source: { duration: 2 } },
    },
    document: { edits: [], advancedContent: advanced },
  };
  const save = vi.fn(async (..._args: unknown[]) => undefined);
  const retained = vi.fn(async () => true);
  const session = {
    getSnapshot: () => state,
    flush: async () => undefined,
    saveSpeechTranscript: save,
    hasDurableSpeechAsset: retained,
    createSpeechPublicationReceipt: () => ({ id: crypto.randomUUID(), at: Date.now() }),
    publishSpeechTranscripts: async (
      changes: readonly import('./speech-publication-state').ReviewSpeechPublicationChange[]
    ) => {
      for (const change of changes)
        await save(change.target, change.expectedAssetId, change.transcript);
    },
    recoverSpeechPublication: async () => false,
  } as unknown as ReviewSpeechSession;
  preview.scope.target = { kind: 'original' };
  preview.geometry = reviewSpeechGeometry(session, { kind: 'original' });
  const asset = {
    id: 'generated',
    protect: vi.fn(async () => undefined),
    publish: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
  };
  mocks.prepare.mockResolvedValue(asset);
  await applyReviewSpeech(session, { kind: 'original' }, [preview], new AbortController().signal, {
    originalVolume: 0.25,
  });
  expect(save).toHaveBeenCalledOnce();
  expect(save).toHaveBeenCalledWith(
    { kind: 'original' },
    'original',
    expect.objectContaining({
      replacements: [
        expect.objectContaining({
          id: preview.replacement.id,
          assetId: 'project-asset:generated',
          enabled: true,
          originalVolume: 0.25,
        }),
      ],
    })
  );
  expect(mocks.prepare.mock.calls[0]![6]).toEqual({
    publishToLibrary: false,
    requiredReviewSpeech: {
      aggregateId: 'workspace',
      target: { kind: 'original' },
      replacementId: preview.replacement.id,
    },
  });
  expect(advanced.audio.original.volume).toBe(0.6);
  save.mockRejectedValueOnce(new Error('response lost'));
  await expect(
    applyReviewSpeech(session, { kind: 'original' }, [preview], new AbortController().signal)
  ).rejects.toThrow('response lost');
  expect(retained).toHaveBeenCalledWith(
    { kind: 'original' },
    preview.replacement.id,
    'project-asset:generated'
  );
  expect(asset.cancel).not.toHaveBeenCalled();
});

it.each(['prepare', 'protect'] as const)(
  'never partially accepts a batch when its second %s fails',
  async (phase) => {
    const { session, preview, clip, commitDurable } = fixture();
    const phrase = { ...clip.transcript.phrases[0]!, id: 'second', start: 2, end: 4 };
    clip.transcript.phrases.push(phrase);
    const second = {
      ...preview,
      scope: { ...preview.scope, nativeStart: 2, nativeEnd: 4 },
      replacement: {
        ...preview.replacement,
        id: 'second-replacement',
        phraseId: 'second',
        start: 2,
        end: 4,
      },
    };
    const firstAsset = {
      id: 'one',
      protect: vi.fn(async () => undefined),
      publish: vi.fn(),
      cancel: vi.fn(),
    };
    const secondAsset = {
      id: 'two',
      protect: vi.fn(async () => {
        if (phase === 'protect') throw new Error('second failure');
      }),
      publish: vi.fn(),
      cancel: vi.fn(),
    };
    mocks.prepare.mockResolvedValueOnce(firstAsset);
    if (phase === 'prepare') mocks.prepare.mockRejectedValueOnce(new Error('second failure'));
    else mocks.prepare.mockResolvedValueOnce(secondAsset);
    await expect(
      applyReviewSpeech(
        session,
        { kind: 'voiceover', clipId: 'clip' },
        [preview, second],
        new AbortController().signal
      )
    ).rejects.toThrow('second failure');
    expect(commitDurable).not.toHaveBeenCalled();
    expect(firstAsset.cancel).toHaveBeenCalledOnce();
    expect(firstAsset.publish).not.toHaveBeenCalled();
    if (phase === 'protect') expect(secondAsset.cancel).toHaveBeenCalledOnce();
  }
);

it('discards generated output when text changes while the decoder is pending', async () => {
  const { session, preview, clip } = fixture();
  mocks.job.mockResolvedValue({ type: 'audio', staged: preview.staged });
  mocks.read.mockResolvedValue(preview.blob);
  mocks.decode.mockImplementationOnce(async () => {
    clip.transcript.phrases[0]!.revision++;
    return 1;
  });
  await expect(
    generateReviewSpeech(
      session,
      { kind: 'voiceover', clipId: 'clip' },
      'phrase',
      profile,
      new AbortController().signal
    )
  ).rejects.toThrow('stale');
  expect(mocks.discard).toHaveBeenCalledWith(
    preview.staged,
    expect.objectContaining({ target: { kind: 'voiceover', clipId: 'clip' } })
  );
});
