import type { QuickEditAudioClip } from '../../features/video/review/advanced/types';
import type { ReviewSpeechTranscript } from '../../features/video/review/speech-transcript';
import type { ReviewSpeechSession } from './speech-publication';
import { parseAudioJobServerMessage } from '../../contracts/ai/audio';
import { parseReviewSpeechTranscript } from '../../features/video/review/speech-validation';
import { describe, expect, it, vi } from 'vitest';
import {
  reviewSpeechChunks,
  reviewSpeechPhrases,
  transcribeReviewSpeech,
} from './speech-transcription';

describe('native speech transcription', () => {
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
  it('does not bridge a cut or overlap text-only chunks', () => {
    expect(
      reviewSpeechChunks([
        { start: 4, end: 125 },
        { start: 140, end: 144 },
      ])
    ).toEqual([
      { start: 4, end: 64 },
      { start: 64, end: 124 },
      { start: 124, end: 125 },
      { start: 140, end: 144 },
    ]);
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
  } as unknown as ReviewSpeechSession;
  return { session, clip, saveSpeechTranscript };
}
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
  expect(clip.transcript?.phrases.map((p) => p.text)).toEqual(['First']);
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

it('recognizes selected original native ranges excluding cuts even when original is muted', async () => {
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
    [
      { start: 2, end: 4 },
      { start: 6, end: 8 },
    ],
    expect.any(AbortSignal)
  );
  expect(workflow.job.mock.calls.map((call) => call[0].scope)).toEqual([
    expect.objectContaining({
      target: { kind: 'original' },
      assetId: 'source',
      workspaceRevision: 1,
      nativeStart: 2,
      nativeEnd: 4,
    }),
    expect.objectContaining({
      target: { kind: 'original' },
      assetId: 'source',
      workspaceRevision: 2,
      nativeStart: 6,
      nativeEnd: 8,
    }),
  ]);
  expect(advanced.audio.originalSpeech?.transcript.phrases.map((p) => [p.start, p.end])).toEqual([
    [2, 4],
    [6, 8],
  ]);
  expect(advanced.audio.original.muted).toBe(true);
  await expect(
    transcribeReviewSpeech(session, { kind: 'original' }, 'model', new AbortController().signal, {
      original: { file, sourceAssetId: 'other' },
    })
  ).rejects.toThrow('stale');
});
