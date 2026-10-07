import type { QuickEditAudioClip } from '../../features/video/review/advanced/types';
import type { ReviewSpeechTranscript } from '../../features/video/review/speech-transcript';
import type { ReviewSpeechSession } from './speech-publication';
import { describe, expect, it, vi } from 'vitest';
import {
  reviewSpeechChunks,
  reviewSpeechPhrases,
  transcribeReviewSpeech,
} from './speech-transcription';

describe('native speech transcription', () => {
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
  plan: vi.fn(async () => [
    { start: 0, end: 1 },
    { start: 1, end: 2 },
  ]),
}));
vi.mock('./speech-client', () => ({ runReviewSpeechJob: workflow.job }));
vi.mock('./speech-audio', () => ({
  extractReviewSpeechWav: workflow.extract,
  planReviewSpeechChunks: workflow.plan,
}));
function speechSession() {
  const clip: QuickEditAudioClip = {
    id: 'clip',
    assetId: 'project-asset:original',
    timelineStart: 0,
    sourceOffset: 0,
    duration: 2,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  };
  const state = {
    snapshot: { workspace: { aggregateId: 'workspace', revision: 1, source: { duration: 2 } } },
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
    transcribeReviewSpeech(session, 'clip', 'model', new AbortController().signal)
  ).rejects.toThrow('provider-failed');
  expect(clip.transcript?.phrases.map((p) => p.text)).toEqual(['First']);
  await transcribeReviewSpeech(session, 'clip', 'model', new AbortController().signal);
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
    transcribeReviewSpeech(session, 'clip', 'model', new AbortController().signal)
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
      transcribeReviewSpeech(session, 'clip', 'model', new AbortController().signal)
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
