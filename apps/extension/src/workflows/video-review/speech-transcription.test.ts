import type { QuickEditAudioClip } from '../../features/video/review/advanced/types';
import type { ReviewSpeechTranscript } from '../../features/video/review/speech-transcript';
import type { ReviewSpeechSession } from './speech-publication';
import { parseAudioJobServerMessage } from '../../contracts/ai/audio';
import { parseReviewSpeechTranscript } from '../../features/video/review/speech-validation';
import { describe, expect, it, vi } from 'vitest';
import { reviewSpeechPhrases, transcribeReviewSpeech } from './speech-transcription';
import { createRecognitionFixture } from './recognition.test-support';
import type { ReviewSpeechPublicationChange } from './speech-publication-state';

describe('native speech transcription', () => {
  it('keeps provider segment timing and all text when some words have zero duration', () => {
    const phrases = reviewSpeechPhrases(
      {
        text: 'Hello there! Next sentence.',
        segments: [
          { text: 'Hello there!', start: 0.1, end: 1 },
          { text: 'Next sentence.', start: 2, end: 3 },
        ],
        words: [
          { text: 'Hello', start: 0.1, end: 0.5 },
          { text: 'there', start: 0.5, end: 0.5 },
          { text: 'Next', start: 2, end: 2.4 },
          { text: 'sentence', start: 2.4, end: 3 },
        ],
      },
      10,
      14
    );
    expect(phrases.map(({ text, start, end }) => ({ text, start, end }))).toEqual([
      { text: 'Hello there!', start: 10.1, end: 11 },
      { text: 'Next sentence.', start: 12, end: 13 },
    ]);
    expect(
      phrases.flatMap((phrase) => phrase.words ?? []).every((word) => word.end > word.start)
    ).toBe(true);
  });
  it('uses punctuation from complete provider text when word timing omits it', () => {
    const phrases = reviewSpeechPhrases(
      {
        text: 'Hello world! Next sentence.',
        words: [
          { text: 'Hello', start: 0, end: 0.4 },
          { text: 'world', start: 0.4, end: 1 },
          { text: 'Next', start: 1, end: 1.4 },
          { text: 'sentence', start: 1.4, end: 2 },
        ],
      },
      0,
      3,
      { splitAtPauses: false }
    );
    expect(phrases.map((phrase) => phrase.text)).toEqual(['Hello world!', 'Next sentence.']);
  });
  it.each([1, 2])(
    'retains text and reliable anchors through transport and persistence with zero word %i',
    (zero) => {
      const raw = {
        text: 'yes, yes. Last',
        words: [
          { text: 'yes,', start: 0, end: 0.4 },
          { text: 'yes.', start: 0.4, end: 0.8 },
          { text: 'Last', start: 0.8, end: 1.2 },
        ].map((word, index) => (index === zero ? { ...word, end: word.start } : word)),
      };
      const message = parseAudioJobServerMessage({
        type: 'transcript',
        requestId: 'partial',
        result: raw,
      });
      expect(message?.type).toBe('transcript');
      if (message?.type !== 'transcript') throw new Error('Missing transcript');
      const phrases = reviewSpeechPhrases(message.result, 10, 12);
      expect(phrases).toHaveLength(1);
      expect(phrases[0]).toMatchObject({
        text: raw.text,
        originalText: raw.text,
        start: 10,
        end: 12,
        alignment: 'range',
      });
      expect(phrases[0]?.words).toEqual(
        raw.words
          .filter((word) => word.end > word.start)
          .map((word) => ({ text: word.text, start: word.start + 10, end: word.end + 10 }))
      );
      expect(
        parseReviewSpeechTranscript({ version: 1, phrases, replacements: [] })?.phrases
      ).toEqual(phrases);
    }
  );
  it('retains wholly unaligned text without inventing an interval for its word', () => {
    const phrases = reviewSpeechPhrases(
      { text: 'Done.', words: [{ text: 'Done.', start: 2, end: 2 }] },
      10,
      12
    );
    expect(phrases[0]).toMatchObject({ text: 'Done.', start: 10, end: 12, alignment: 'range' });
    expect(phrases[0]?.words).toBeUndefined();
  });
  it('splits provider words at real pauses and adds native offset once', () => {
    const phrases = reviewSpeechPhrases(
      {
        text: 'Hello world again',
        words: [
          { text: 'Hello', start: 0, end: 0.4 },
          { text: 'world', start: 0.5, end: 1 },
          { text: 'again', start: 1.8, end: 2.2 },
        ],
      },
      10,
      13
    );
    expect(phrases.map(({ text, start, end }) => ({ text, start, end }))).toEqual([
      { text: 'Hello world', start: 10, end: 11 },
      { text: 'again', start: 11.8, end: 12.2 },
    ]);
    expect(phrases[1]?.words?.[0]?.start).toBe(11.8);
  });
  it('keeps text-only alignment honest and silence empty', () => {
    expect(reviewSpeechPhrases({ text: 'Words without timestamps' }, 8, 12)[0]).toMatchObject({
      start: 8,
      end: 12,
      alignment: 'range',
    });
    expect(reviewSpeechPhrases({ text: ' ' }, 8, 12)).toEqual([]);
  });
  it('supports sentence-only grouping without moving words through a pause', () => {
    const phrases = reviewSpeechPhrases(
      {
        text: 'Hello again. Next',
        words: [
          { text: 'Hello', start: 0, end: 0.5 },
          { text: 'again.', start: 5, end: 5.5 },
          { text: 'Next', start: 6, end: 6.5 },
        ],
      },
      10,
      20,
      { splitAtPauses: false }
    );
    expect(phrases.map((phrase) => [phrase.text, phrase.start, phrase.end])).toEqual([
      ['Hello again.', 10, 15.5],
      ['Next', 16, 16.5],
    ]);
    expect(phrases[0]?.words?.map((word) => word.start)).toEqual([10, 15]);
  });
  it('rejects supplied unsafe timing instead of silently downgrading alignment', () => {
    expect(() =>
      reviewSpeechPhrases({ text: 'text', words: [{ text: 'text', start: -1, end: 20 }] }, 2, 4)
    ).toThrow('invalid-response');
  });
});

const workflow = vi.hoisted(() => ({
  job: vi.fn(),
  extract: vi.fn(async () => new Blob(['pcm'])),
  plan: vi.fn(
    async (
      _source: string | Blob,
      _ranges: readonly { start: number; end: number }[],
      _signal: AbortSignal
    ) => [
      { start: 0, end: 1 },
      { start: 1, end: 2 },
    ]
  ),
}));
vi.mock('./speech-client', () => ({ runReviewSpeechJob: workflow.job }));
vi.mock('./speech-audio', async (original) => ({
  ...(await original<typeof import('./speech-audio')>()),
  extractReviewSpeechWav: workflow.extract,
  planReviewSpeechChunks: workflow.plan,
}));
function speechSession(duration = 2) {
  const clip: QuickEditAudioClip = {
    id: 'clip',
    assetId: 'project-asset:original',
    timelineStart: 0,
    sourceOffset: 0,
    duration,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  };
  const state = {
    snapshot: { workspace: { aggregateId: 'workspace', revision: 1, source: { duration } } },
    document: { edits: [], advancedContent: { audio: { voiceover: [clip] } } },
  };
  const saveSpeechTranscript = vi.fn(
    async (_id: string, _asset: string, transcript: ReviewSpeechTranscript) => {
      clip.transcript = transcript;
      state.snapshot.workspace.revision++;
    }
  );
  const session = {
    getSnapshot: () => state,
    flush: async () => undefined,
    saveSpeechTranscript,
    createSpeechPublicationReceipt: () => ({ id: crypto.randomUUID(), at: Date.now() }),
    publishSpeechTranscripts: async (changes: readonly ReviewSpeechPublicationChange[]) => {
      for (const change of changes)
        await saveSpeechTranscript(change.target.kind, change.expectedAssetId, change.transcript);
    },
  } as unknown as ReviewSpeechSession;
  return { session, clip, saveSpeechTranscript };
}
it.each([2, 75])('publishes %i transcript chunks as one logical Undo transition', async (count) => {
  const { session, deps } = createRecognitionFixture(count);
  workflow.plan.mockResolvedValueOnce(
    Array.from({ length: count }, (_, index) => ({ start: index, end: index + 1 }))
  );
  workflow.job.mockReset();
  workflow.job.mockResolvedValue({ type: 'transcript', result: { text: 'Synthetic phrase.' } });
  await transcribeReviewSpeech(
    session,
    { kind: 'original' },
    'model',
    new AbortController().signal,
    {
      original: { file: new Blob(['synthetic source']), sourceAssetId: 'source' },
    }
  );
  expect(
    session.getSnapshot().document.advancedContent.audio.originalSpeech?.transcript?.phrases
  ).toHaveLength(count);
  expect(deps.commitVideoWorkspace).toHaveBeenCalledOnce();
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
  await session.history('undo');
  expect(session.getSnapshot().document.advancedContent.audio.originalSpeech).toBeUndefined();
  await session.history('redo');
  expect(
    session.getSnapshot().document.advancedContent.audio.originalSpeech?.transcript?.phrases
  ).toHaveLength(count);
});

it('retains successful chunks and retries only unfinished paid work after provider failure', async () => {
  const { session, clip } = speechSession();
  workflow.job.mockReset();
  workflow.job
    .mockImplementationOnce(async (_start, options) => {
      await options.prepareInput(new AbortController().signal);
      return { type: 'transcript', result: { text: 'First' } };
    })
    .mockRejectedValueOnce(new Error('provider-failed'))
    .mockResolvedValueOnce({ type: 'transcript', result: { text: 'Second' } });
  await expect(
    transcribeReviewSpeech(
      session,
      { kind: 'voiceover', clipId: 'clip' },
      'model',
      new AbortController().signal
    )
  ).rejects.toThrow('provider-failed');
  expect(clip.transcript).toBeUndefined();
  await transcribeReviewSpeech(
    session,
    { kind: 'voiceover', clipId: 'clip' },
    'model',
    new AbortController().signal
  );
  expect(clip.transcript?.phrases.map((p) => p.text)).toEqual(['First', 'Second']);
  expect(workflow.job.mock.calls.map((call) => call[0].scope.nativeStart)).toEqual([0, 1, 1]);
});
it('rejects a response after clip geometry changed and preserves existing text', async () => {
  const { session, clip, saveSpeechTranscript } = speechSession();
  workflow.job.mockReset();
  workflow.job.mockImplementationOnce(async () => {
    clip.sourceOffset = 0.5;
    return { type: 'transcript', result: { text: 'Obsolete' } };
  });
  await expect(
    transcribeReviewSpeech(
      session,
      { kind: 'voiceover', clipId: 'clip' },
      'model',
      new AbortController().signal
    )
  ).rejects.toThrow('stale');
  expect(saveSpeechTranscript).not.toHaveBeenCalled();
});
it('rejects changed text and mismatched response kind before durable publication', async () => {
  for (const changedText of [true, false]) {
    const { session, clip, saveSpeechTranscript } = speechSession();
    workflow.job.mockReset();
    workflow.job.mockImplementationOnce(async () => {
      if (changedText) clip.transcript = { version: 1, phrases: [], replacements: [] };
      return changedText
        ? { type: 'transcript', result: { text: 'Obsolete' } }
        : { type: 'audio', staged: {} };
    });
    await expect(
      transcribeReviewSpeech(
        session,
        { kind: 'voiceover', clipId: 'clip' },
        'model',
        new AbortController().signal
      )
    ).rejects.toThrow(changedText ? 'stale' : 'invalid-response');
    expect(saveSpeechTranscript).not.toHaveBeenCalled();
  }
});
it('normalizes segment-only responses and rejects overlapping supplied times', () => {
  expect(
    reviewSpeechPhrases(
      { text: 'Sentence', segments: [{ text: 'Sentence', start: 0.2, end: 1 }] },
      4,
      6
    )[0]
  ).toMatchObject({ alignment: 'segment', start: 4.2, end: 5 });
  expect(() =>
    reviewSpeechPhrases(
      {
        text: 'Overlap',
        words: [
          { text: 'a', start: 0, end: 1 },
          { text: 'b', start: 0.5, end: 1.5 },
        ],
      },
      0,
      2
    )
  ).toThrow('invalid-response');
});

it.each([false, true])(
  'reports local planning failure for a long clip, cancellation=%s',
  async (cancelled) => {
    const { session, saveSpeechTranscript } = speechSession(75);
    const controller = new AbortController();
    workflow.job.mockReset();
    workflow.plan.mockClear();
    workflow.plan.mockImplementationOnce(async () => {
      if (cancelled) controller.abort();
      throw new Error('private decoder failure');
    });
    const pending = transcribeReviewSpeech(
      session,
      { kind: 'voiceover', clipId: 'clip' },
      'model',
      controller.signal
    );
    if (cancelled) await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    else await expect(pending).rejects.toThrow(/^decode-failed$/);
    expect(workflow.plan).toHaveBeenCalledWith(
      'project-asset:original',
      [{ start: 0, end: 75 }],
      controller.signal
    );
    expect(workflow.job).not.toHaveBeenCalled();
    expect(saveSpeechTranscript).not.toHaveBeenCalled();
  }
);

it('recognizes selected original native ranges including cuts even when original is muted', async () => {
  const { createQuickEditAdvancedState } =
    await import('../../features/video/review/advanced/defaults');
  const advanced = createQuickEditAdvancedState();
  advanced.audio.original.muted = true;
  const state = {
    snapshot: {
      workspace: {
        aggregateId: 'w',
        revision: 1,
        sourceAssetId: 'source',
        source: { duration: 10 },
      },
    },
    document: {
      edits: [
        { id: 'cut', kind: 'cut' as const, start: 4, end: 6, requestedStart: 4, requestedEnd: 6 },
      ],
      advancedContent: advanced,
    },
  };
  const save = vi.fn(
    async (_target: unknown, _asset: string, transcript: ReviewSpeechTranscript) => {
      advanced.audio.originalSpeech = {
        enabled: true,
        transcript: { ...transcript, replacements: [] },
      };
      state.snapshot.workspace.revision++;
    }
  );
  const session = {
    getSnapshot: () => state,
    flush: async () => undefined,
    saveSpeechTranscript: save,
    createSpeechPublicationReceipt: () => ({ id: crypto.randomUUID(), at: Date.now() }),
    publishSpeechTranscripts: async (changes: readonly ReviewSpeechPublicationChange[]) => {
      for (const change of changes)
        await save(change.target, change.expectedAssetId, change.transcript);
    },
  } as unknown as ReviewSpeechSession;
  const file = new Blob(['original']);
  workflow.plan.mockImplementationOnce(async (_source, ranges) => [...ranges]);
  workflow.job.mockReset();
  workflow.job.mockImplementation(async (_start, options) => {
    await options.prepareInput(new AbortController().signal);
    return { type: 'transcript', result: { text: 'words' } };
  });
  await transcribeReviewSpeech(
    session,
    { kind: 'original' },
    'model',
    new AbortController().signal,
    { original: { file, sourceAssetId: 'source' }, selection: { start: 2, end: 8 } }
  );
  expect(workflow.plan).toHaveBeenLastCalledWith(
    file,
    [{ start: 2, end: 8 }],
    expect.any(AbortSignal)
  );
  expect(workflow.job.mock.calls.map((call) => call[0].scope)).toEqual([
    expect.objectContaining({
      target: { kind: 'original' },
      assetId: 'source',
      workspaceRevision: 1,
      nativeStart: 2,
      nativeEnd: 8,
    }),
  ]);
  expect(advanced.audio.originalSpeech?.transcript.phrases.map((p) => [p.start, p.end])).toEqual([
    [2, 8],
  ]);
  expect(advanced.audio.original.muted).toBe(true);
  await expect(
    transcribeReviewSpeech(session, { kind: 'original' }, 'model', new AbortController().signal, {
      original: { file, sourceAssetId: 'other' },
    })
  ).rejects.toThrow('stale');
});

it.each([false, true])(
  'retries only the final publication after storage failure, committed=%s',
  async (committed) => {
    const { session, deps } = createRecognitionFixture(2);
    workflow.job.mockReset();
    workflow.job.mockResolvedValue({ type: 'transcript', result: { text: 'Cached.' } });
    const commit = deps.commitVideoWorkspace.getMockImplementation()!;
    deps.commitVideoWorkspace.mockImplementationOnce(async (request) => {
      if (committed) await commit(request);
      throw new Error('Save acknowledgement failed');
    });
    const options = { original: { file: new Blob(['synthetic']), sourceAssetId: 'source' } };
    await expect(
      transcribeReviewSpeech(
        session,
        { kind: 'original' },
        'model',
        new AbortController().signal,
        options
      )
    ).rejects.toThrow('Save acknowledgement failed');
    expect(workflow.job).toHaveBeenCalledTimes(2);
    expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(0);
    await transcribeReviewSpeech(
      session,
      { kind: 'original' },
      'model',
      new AbortController().signal,
      options
    );
    expect(workflow.job).toHaveBeenCalledTimes(2);
    expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
    const accepted = session.getSnapshot().snapshot.workspace.history[0]!;
    for (const [request] of deps.commitVideoWorkspace.mock.calls)
      expect(request.operation).toMatchObject({ id: accepted.id });
    expect(deps.commitVideoWorkspace).toHaveBeenCalledTimes(committed ? 1 : 2);
  }
);
