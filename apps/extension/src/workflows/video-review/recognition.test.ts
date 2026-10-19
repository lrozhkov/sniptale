import { createRecognitionFixture as fixture } from './recognition.test-support';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIO_INPUT_MAX_SECONDS, type AudioTranscriptResult } from '../../contracts/ai/audio';
import {
  addReviewTextFragment,
  createReviewTextDocument,
} from '../../features/video/review/text-document';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import { createVideoReviewSession } from './session';
import {
  applyReviewRecognition,
  reviewRecognitionWasApplied,
  prepareReviewRecognition,
  runReviewRecognition,
} from './recognition';
import { reviewRecognitionPhrases } from './recognition-text';

const remote = vi.hoisted(() => ({
  job: vi.fn(),
  extract: vi.fn(async () => new Blob(['pcm'])),
  plan: vi.fn(async (_source: string | Blob, ranges: readonly { start: number; end: number }[]) =>
    ranges.flatMap((range) => {
      const chunks: Array<{ start: number; end: number }> = [];
      for (let start = range.start; start < range.end; start += 60)
        chunks.push({ start, end: Math.min(start + 60, range.end) });
      return chunks;
    })
  ),
}));
vi.mock('../audio-jobs/client', () => ({ runReviewSpeechJob: remote.job }));
vi.mock('./speech-audio', () => ({
  extractReviewSpeechWav: remote.extract,
  planReviewSpeechChunks: remote.plan,
  reviewSpeechWavIsSilent: async () => false,
}));

const signal = () => new AbortController().signal;
const original = { file: new Blob(['source']), sourceAssetId: 'source' };
const prepare = (session: ReturnType<typeof createVideoReviewSession>, options = {}) =>
  prepareReviewRecognition(session, { kind: 'original' }, 'model', 'provider', signal(), {
    original,
    ...options,
  });
const words = (entries: Array<[string, number, number]>): AudioTranscriptResult => ({
  text: entries.map(([text]) => text).join(' '),
  words: entries.map(([text, start, end]) => ({ text, start, end })),
});
beforeEach(() => {
  remote.job.mockReset();
  remote.plan.mockClear();
  remote.extract.mockClear();
  remote.job.mockResolvedValue({ type: 'transcript', result: { text: 'Sentence.' } });
});

describe('recognition grouping across native transport boundaries', () => {
  it('joins a sentence across 60 seconds and offsets each word exactly once', () => {
    const phrases = reviewRecognitionPhrases(
      [
        { range: 0, start: 0, end: 60, result: words([['Hello', 59.5, 59.8]]) },
        {
          range: 0,
          start: 60,
          end: 120,
          result: words([
            ['world.', 0, 0.3],
            ['Next', 1, 1.3],
          ]),
        },
      ],
      'sentences-pauses'
    );
    expect(phrases.map(({ text, start, end }) => ({ text, start, end }))).toEqual([
      { text: 'Hello world.', start: 59.5, end: 60.3 },
      { text: 'Next', start: 61, end: 61.3 },
    ]);
    expect(phrases[0]?.words?.[1]?.start).toBe(60);
  });
  it.each(['sentences', 'sentences-pauses'] as const)(
    'preserves punctuation and cut barriers in %s mode',
    (grouping) => {
      const chunks = [
        { range: 0, start: 0, end: 60, result: words([['Done.', 59, 59.5]]) },
        { range: 0, start: 60, end: 120, result: words([['Continue', 0, 0.5]]) },
        { range: 1, start: 140, end: 150, result: words([['after cut', 0, 0.5]]) },
      ];
      expect(reviewRecognitionPhrases(chunks, grouping)).toHaveLength(3);
    }
  );
  it('preserves silence and lets the explicit sentence option span it without moving anchors', () => {
    const chunks = [
      { range: 0, start: 0, end: 60, result: words([['Before', 2, 2.5]]) },
      { range: 0, start: 60, end: 120, result: words([['after.', 3, 3.5]]) },
    ];
    expect(
      reviewRecognitionPhrases(chunks, 'sentences-pauses').map((p) => [p.start, p.end])
    ).toEqual([
      [2, 2.5],
      [63, 63.5],
    ]);
    expect(
      reviewRecognitionPhrases(chunks, 'sentences')[0]?.words?.map((word) => word.start)
    ).toEqual([2, 63]);
  });
  it('does not invent timestamps or join coarse ranges', () => {
    const phrases = reviewRecognitionPhrases(
      [
        { range: 0, start: 0, end: 60, result: { text: 'First' } },
        { range: 0, start: 60, end: 120, result: { text: 'Second' } },
      ],
      'sentences'
    );
    expect(phrases.map((p) => [p.alignment, p.start, p.end, p.words])).toEqual([
      ['range', 0, 60, undefined],
      ['range', 60, 120, undefined],
    ]);
  });
  it('rejects malformed supplied timing and incomplete chunks', () => {
    expect(() =>
      reviewRecognitionPhrases(
        [{ range: 0, start: 0, end: 2, result: words([['Bad', -1, 1]]) }],
        'sentences'
      )
    ).toThrow('invalid-response');
    expect(() => reviewRecognitionPhrases([{ range: 0, start: 0, end: 2 }], 'sentences')).toThrow(
      'invalid-response'
    );
  });
});

describe('disposable recognition and one explicit acceptance', () => {
  it('refuses an unproved dormant placement before saving or sending its audio', async () => {
    const { session, deps } = fixture(10);
    const advanced = session.getSnapshot().snapshot.workspace.advanced;
    await session.saveAdvanced({
      ...advanced,
      audio: {
        ...advanced.audio,
        voiceover: [
          {
            id: 'clip',
            assetId: 'project-asset:voice',
            timelineStart: 0,
            sourceOffset: 1,
            duration: 6,
            dormant: true,
            volume: 1,
            muted: false,
            fadeIn: 0,
            fadeOut: 0,
          },
        ],
      },
    });
    await expect(
      prepareReviewRecognition(
        session,
        { kind: 'voiceover', clipId: 'clip' },
        'model',
        'provider',
        signal()
      )
    ).rejects.toThrow('invalid-request');
    expect(deps.saveVideoWorkspaceSnapshot).not.toHaveBeenCalled();
    expect(remote.job).not.toHaveBeenCalled();
  });
  it('excludes native cut samples after Speed and maps recognized words to the retained result slices', async () => {
    const { session } = fixture(10);
    const advanced = session.getSnapshot().snapshot.workspace.advanced;
    const clip = {
      id: 'clip',
      assetId: 'project-asset:voice',
      timelineStart: 0,
      sourceOffset: 0,
      duration: 8,
      sourceAnchor: [{ start: 0, end: 8, offset: 0, duration: 8 }],
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    };
    await session.saveAdvanced({
      ...advanced,
      audio: {
        ...advanced.audio,
        voiceover: [clip],
        voiceoverSegments: buildReviewTimeMap(10, []),
      },
    });
    for (const edit of [
      {
        id: 'speed',
        kind: 'speed' as const,
        start: 0,
        end: 4,
        requestedStart: 0,
        requestedEnd: 4,
        rate: 2 as const,
        audio: 'speed' as const,
      },
      { id: 'cut', kind: 'cut' as const, start: 4, end: 6, requestedStart: 4, requestedEnd: 6 },
    ])
      await session.commit({ id: edit.id, at: 1, target: 'edit', before: null, after: edit });
    const job = await prepareReviewRecognition(
      session,
      { kind: 'voiceover', clipId: 'clip' },
      'model',
      'provider',
      signal()
    );
    expect(job.ranges).toEqual([
      { start: 0, end: 2 },
      { start: 4, end: 8 },
    ]);
    remote.job.mockResolvedValue({ type: 'transcript', result: words([['Words.', 0.5, 1]]) });
    const proposal = await runReviewRecognition(session, job, signal());
    expect(
      proposal.document.fragments.map((fragment) => [
        fragment.start,
        fragment.end,
        fragment.origin?.start,
        fragment.origin?.end,
      ])
    ).toEqual([
      [0.5, 1, 0.5, 1],
      [2.5, 3, 4.5, 5],
    ]);
    expect(
      remote.job.mock.calls.map((call) => [call[0].scope.nativeStart, call[0].scope.nativeEnd])
    ).toEqual([
      [0, 2],
      [4, 8],
    ]);
  });
  it('refuses changed clip timing before any provider request', async () => {
    const { session } = fixture(10);
    const advanced = session.getSnapshot().snapshot.workspace.advanced;
    const clip = {
      id: 'clip',
      assetId: 'project-asset:voice',
      timelineStart: 0,
      sourceOffset: 1,
      duration: 6,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    };
    await session.saveAdvanced({ ...advanced, audio: { ...advanced.audio, voiceover: [clip] } });
    const job = await prepareReviewRecognition(
      session,
      { kind: 'voiceover', clipId: 'clip' },
      'model',
      'provider',
      signal()
    );
    const before = session.getSnapshot().document.advancedContent;
    await session.commit({
      id: 'trim',
      at: 1,
      target: 'advancedContent',
      before,
      after: { ...before, audio: { ...before.audio, voiceover: [{ ...clip, sourceOffset: 2 }] } },
    });
    await expect(runReviewRecognition(session, job, signal())).rejects.toThrow('stale');
    expect(remote.job).not.toHaveBeenCalled();
  });
});

describe('recognition continuity and placement', () => {
  it('allows volume edits while reviewing unchanged clip samples and preserves those edits on Apply', async () => {
    const { session } = fixture(10);
    const advanced = session.getSnapshot().snapshot.workspace.advanced;
    const clip = {
      id: 'clip',
      assetId: 'project-asset:voice',
      timelineStart: 0,
      sourceOffset: 1,
      duration: 6,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    };
    await session.saveAdvanced({ ...advanced, audio: { ...advanced.audio, voiceover: [clip] } });
    const job = await prepareReviewRecognition(
      session,
      { kind: 'voiceover', clipId: 'clip' },
      'model',
      'provider',
      signal()
    );
    const proposal = await runReviewRecognition(session, job, signal());
    const before = session.getSnapshot().document.advancedContent;
    const edited = { ...clip, volume: 0.4, muted: true, fadeIn: 0.2 };
    await session.commit({
      id: 'gain',
      at: 1,
      target: 'advancedContent',
      before,
      after: { ...before, audio: { ...before.audio, voiceover: [edited] } },
    });
    await applyReviewRecognition(session, proposal, signal());
    expect(session.getSnapshot().document.advancedContent.audio.voiceover).toEqual([edited]);
    expect(session.getSnapshot().document.advancedContent.text?.fragments).toHaveLength(1);
  });
  it('recognizes the complete selected source through Speed and Cut', async () => {
    const { session } = fixture(10);
    for (const edit of [
      {
        id: 'speed',
        kind: 'speed' as const,
        start: 2,
        end: 4,
        requestedStart: 2,
        requestedEnd: 4,
        rate: 2 as const,
        audio: 'speed' as const,
      },
      { id: 'cut', kind: 'cut' as const, start: 4, end: 6, requestedStart: 4, requestedEnd: 6 },
    ])
      await session.commit({ id: edit.id, at: 1, target: 'edit', before: null, after: edit });
    const job = await prepare(session, { selection: { start: 1, end: 8 } });
    expect(job.ranges).toEqual([{ start: 1, end: 8 }]);
    remote.job.mockResolvedValueOnce({
      type: 'transcript',
      result: words([
        ['Across', 0, 0.5],
        ['speed.', 0.8, 1.5],
      ]),
    });
    const proposal = await runReviewRecognition(session, job, signal());
    expect(proposal.document.fragments[0]).toMatchObject({
      text: 'Across speed.',
      start: 1,
      end: 2.5,
      timeDomain: 'source',
    });
    expect(
      remote.job.mock.calls.map((call) => [call[0].scope.nativeStart, call[0].scope.nativeEnd])
    ).toEqual([[1, 8]]);
  });
  it('recognizes only retained trimmed native samples and projects tempo into result text', async () => {
    const { session } = fixture(10);
    const advanced = session.getSnapshot().snapshot.workspace.advanced;
    const clip = {
      id: 'clip',
      assetId: 'project-asset:voice',
      timelineStart: 1,
      sourceOffset: 3,
      duration: 6,
      tempo: 2,
      volume: 0.4,
      muted: true,
      fadeIn: 0,
      fadeOut: 0,
    };
    await session.saveAdvanced({ ...advanced, audio: { ...advanced.audio, voiceover: [clip] } });
    const job = await prepareReviewRecognition(
      session,
      { kind: 'voiceover', clipId: 'clip' },
      'model',
      'provider',
      signal()
    );
    expect(job.ranges).toEqual([{ start: 3, end: 9 }]);
    remote.job.mockResolvedValueOnce({
      type: 'transcript',
      result: words([
        ['Exact', 1, 2],
        ['words.', 2, 3],
      ]),
    });
    const proposal = await runReviewRecognition(session, job, signal());
    expect(proposal.document.fragments[0]).toMatchObject({
      text: 'Exact words.',
      start: 1.5,
      end: 2.5,
      timeDomain: 'result',
      origin: { kind: 'voiceover', clipId: 'clip', start: 4, end: 6 },
    });
    expect(proposal.document.fragments[0]?.words?.map((word) => [word.start, word.end])).toEqual([
      [1.5, 2],
      [2, 2.5],
    ]);
    await applyReviewRecognition(session, proposal, signal());
    expect(session.getSnapshot().document.advancedContent.audio.voiceover).toEqual([clip]);
  });
});

describe('recognition Save and disposable proposal acceptance', () => {
  it('applies 75 recognized fragments once and preserves whole-result Undo/Redo and repeat identity', async () => {
    const { session, deps } = fixture(10);
    const job = await prepare(session);
    remote.job.mockResolvedValue({
      type: 'transcript',
      result: words(
        Array.from({ length: 75 }, (_, index) => [
          `Synthetic${index}.`,
          (index * 10) / 75,
          ((index + 0.8) * 10) / 75,
        ])
      ),
    });
    const proposal = await runReviewRecognition(session, job, signal());
    expect(proposal.document.fragments).toHaveLength(75);
    await applyReviewRecognition(session, proposal, signal());
    expect(deps.commitVideoWorkspace).toHaveBeenCalledOnce();
    expect(session.getSnapshot().document.advancedContent.text?.fragments).toHaveLength(75);
    await applyReviewRecognition(session, proposal, signal());
    expect(deps.commitVideoWorkspace).toHaveBeenCalledOnce();
    await session.history('undo');
    expect(session.getSnapshot().document.advancedContent.text?.fragments ?? []).toHaveLength(0);
    await session.history('redo');
    expect(session.getSnapshot().document.advancedContent.text?.fragments).toHaveLength(75);
    expect(remote.job).toHaveBeenCalledOnce();
  });
  it('saves the whole intended buffer once before POST, without creating transcript history', async () => {
    const { session, deps } = fixture();
    await session.saveAdvanced({
      ...session.getSnapshot().snapshot.workspace.advanced,
      audio: {
        ...session.getSnapshot().document.advancedContent.audio,
        original: { muted: true, volume: 0.4 },
      },
    });
    const job = await prepare(session);
    expect(deps.saveVideoWorkspaceSnapshot).toHaveBeenCalledOnce();
    const proposal = await runReviewRecognition(session, job, signal());
    expect(remote.job).toHaveBeenCalledTimes(3);
    expect(remote.job.mock.calls[0]?.[0]).toMatchObject({
      approvedProviderId: 'provider',
      scope: { workspaceRevision: 2, nativeStart: 0, nativeEnd: 60 },
    });
    expect(session.getSnapshot().document.advancedContent.text?.fragments ?? []).toHaveLength(0);
    expect(deps.commitVideoWorkspace).not.toHaveBeenCalled();
    await applyReviewRecognition(session, proposal, signal());
    expect(deps.commitVideoWorkspace).toHaveBeenCalledOnce();
    expect(session.getSnapshot().document.advancedContent.text?.fragments).toHaveLength(3);
    expect(session.getSnapshot()).toMatchObject({ autosaveEnabled: false, dirty: false });
    await applyReviewRecognition(session, proposal, signal());
    expect(deps.commitVideoWorkspace).toHaveBeenCalledOnce();
    await session.history('undo');
    expect(session.getSnapshot().document.advancedContent.text?.fragments ?? []).toHaveLength(0);
    await applyReviewRecognition(session, proposal, signal());
    expect(deps.commitVideoWorkspace).toHaveBeenCalledOnce();
    await session.history('redo');
    expect(session.getSnapshot().document.advancedContent.text?.fragments).toHaveLength(3);
  });
  it('refuses missing source, missing provider identity and failed Save before any provider request', async () => {
    const { session, deps } = fixture();
    await expect(
      prepareReviewRecognition(session, { kind: 'original' }, 'model', 'provider', signal())
    ).rejects.toThrow('stale');
    await expect(
      prepareReviewRecognition(session, { kind: 'original' }, 'model', '', signal(), { original })
    ).rejects.toThrow('invalid-request');
    await session.saveAdvanced(session.getSnapshot().snapshot.workspace.advanced);
    deps.saveVideoWorkspaceSnapshot.mockRejectedValueOnce(new Error('failed Save'));
    await expect(prepare(session)).rejects.toThrow('failed Save');
    expect(remote.job).not.toHaveBeenCalled();
    expect(remote.plan).not.toHaveBeenCalled();
  });
  it('retains successful chunks and reuses them only on explicit same-basis retry', async () => {
    const { session } = fixture();
    const job = await prepare(session);
    remote.job
      .mockResolvedValueOnce({ type: 'transcript', result: { text: 'First.' } })
      .mockRejectedValueOnce(new Error('provider failed'));
    await expect(runReviewRecognition(session, job, signal())).rejects.toThrow('provider failed');
    expect(job.chunks[0]?.result?.text).toBe('First.');
    expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(0);
    const retried = await prepare(session, { previous: job });
    expect(retried.id).toBe(job.id);
    await runReviewRecognition(session, retried, signal());
    expect(remote.job.mock.calls.map((call) => call[0].scope.nativeStart)).toEqual([
      0, 60, 60, 120,
    ]);
    const changed = await prepare(session, { previous: job, grouping: 'sentences' });
    expect(changed.id).not.toBe(job.id);
    expect(changed.chunks.every((chunk) => !chunk.result)).toBe(true);
  });
  it('keeps the captured file for same-basis chunk retry instead of mixing two sources', async () => {
    const { session } = fixture();
    const job = await prepare(session);
    const other = { ...original, file: new Blob(['other bytes']) };
    const retry = await prepare(session, { previous: job, original: other });
    expect(retry.id).toBe(job.id);
    expect(retry.source).toBe(original.file);
  });
  it('replaces only fully scoped recognized phrases and preserves edited unrelated text and audio', async () => {
    const { session } = fixture(10);
    let document = createReviewTextDocument();
    for (const id of ['related', 'partial', 'manual', 'mixed']) {
      const added = addReviewTextFragment(document, {
        id,
        start: id === 'partial' ? 0 : 1,
        end: 3,
        text: 'Edited ' + id,
        timeDomain: 'source',
      });
      if (!added.ok) throw new Error('fixture');
      document = added.document;
    }
    document = {
      ...document,
      fragments: document.fragments.map((fragment) =>
        fragment.id === 'mixed'
          ? {
              ...fragment,
              origins: [
                { kind: 'original', start: 1, end: 3 },
                { kind: 'voiceover', clipId: 'other-take', start: 1, end: 3 },
              ],
            }
          : fragment.id === 'manual'
            ? fragment
            : {
                ...fragment,
                revision: 2,
                origin: { kind: 'original', start: fragment.start, end: fragment.end },
              }
      ),
    };
    const advanced = session.getSnapshot().snapshot.workspace.advanced;
    await session.saveAdvanced({
      ...advanced,
      text: document,
      audio: { ...advanced.audio, original: { volume: 0.4, muted: true } },
    });
    const job = await prepare(session, { selection: { start: 1, end: 4 } });
    expect(job.relatedIds).toEqual(['related']);
    const proposal = await runReviewRecognition(session, job, signal());
    await applyReviewRecognition(session, proposal, signal(), 'replace');
    const state = session.getSnapshot().document.advancedContent;
    expect(state.text?.fragments.map((fragment) => fragment.text)).toEqual([
      'Edited partial',
      'Edited manual',
      'Edited mixed',
      'Sentence.',
    ]);
    expect(state.audio.original).toEqual({ volume: 0.4, muted: true });
  });
  it.each(['text', 'source', 'cancel'] as const)(
    'rejects a late response after %s change without applying it',
    async (change) => {
      const { session, deps } = fixture();
      const job = await prepare(session);
      const controller = new AbortController();
      remote.job.mockImplementationOnce(async () => {
        if (change === 'cancel') controller.abort();
        else if (change === 'source')
          await session.commit({
            id: 'cut',
            at: 1,
            target: 'edit',
            before: null,
            after: { id: 'cut', kind: 'cut', start: 0, end: 1, requestedStart: 0, requestedEnd: 1 },
          });
        else {
          const added = addReviewTextFragment(createReviewTextDocument(), {
            id: 'manual',
            start: 0,
            end: 1,
            text: 'Manual',
          });
          if (!added.ok) throw new Error('fixture');
          await session.saveAdvanced({
            ...session.getSnapshot().snapshot.workspace.advanced,
            ...session.getSnapshot().document.advancedContent,
            text: added.document,
          });
        }
        return { type: 'transcript', result: { text: 'Late.' } };
      });
      await expect(runReviewRecognition(session, job, controller.signal)).rejects.toThrow(
        change === 'cancel' ? /abort/i : 'stale'
      );
      expect(job.chunks[0]?.result).toBeUndefined();
      expect(deps.commitVideoWorkspace).not.toHaveBeenCalled();
    }
  );
  it('rejects stale Apply while retaining a reviewable proposal', async () => {
    const { session, deps } = fixture();
    const proposal = await runReviewRecognition(session, await prepare(session), signal());
    const added = addReviewTextFragment(createReviewTextDocument(), {
      id: 'manual',
      start: 0,
      end: 1,
    });
    if (!added.ok) throw new Error('fixture');
    await session.saveAdvanced({
      ...session.getSnapshot().snapshot.workspace.advanced,
      ...session.getSnapshot().document.advancedContent,
      text: added.document,
    });
    await expect(applyReviewRecognition(session, proposal, signal())).rejects.toThrow('stale');
    expect(deps.commitVideoWorkspace).not.toHaveBeenCalled();
    expect(proposal.document.fragments).toHaveLength(3);
  });
});

describe('recognition durable receipt recovery', () => {
  it('treats a receipt absent from a pruned durable window as expired evidence, never as uncommitted', async () => {
    const { session, deps } = fixture();
    const proposal = await runReviewRecognition(session, await prepare(session), signal());
    await applyReviewRecognition(session, proposal, signal());
    const state = session.getSnapshot();
    deps.readVideoWorkspace.mockResolvedValueOnce({
      workspace: {
        ...state.snapshot.workspace,
        formatVersion: 2,
        baseline: state.document,
        advanced: { ...state.document.advancedContent, ui: state.snapshot.workspace.advanced.ui },
        history: [],
        cursor: 0,
        revision: state.snapshot.workspace.revision + 50,
      },
      draft: null,
    });
    await expect(reviewRecognitionWasApplied(session, proposal, signal())).rejects.toThrow('stale');
    expect(deps.commitVideoWorkspace).toHaveBeenCalledOnce();
    expect(remote.job).toHaveBeenCalledTimes(3);
  });
  it('reuses an ambiguous accepted operation receipt without POST, duplicate history or reload', async () => {
    const { session, deps } = fixture();
    const proposal = await runReviewRecognition(session, await prepare(session), signal());
    const commit = deps.commitVideoWorkspace.getMockImplementation()!;
    deps.commitVideoWorkspace.mockImplementationOnce(async (request) => {
      await commit(request);
      throw new Error('lost acknowledgement');
    });
    await expect(applyReviewRecognition(session, proposal, signal())).rejects.toThrow(
      'lost acknowledgement'
    );
    await applyReviewRecognition(session, proposal, signal());
    expect(deps.commitVideoWorkspace).toHaveBeenCalledOnce();
    expect(remote.job).toHaveBeenCalledTimes(3);
    expect((await session.readRetainedReviewOperation(proposal.receipt!.id))?.target).toBe(
      'advancedContent'
    );
  });
  it('preserves the receipt and refuses a retry when canonical authority is unavailable', async () => {
    const { session, deps } = fixture();
    const proposal = await runReviewRecognition(session, await prepare(session), signal());
    deps.commitVideoWorkspace.mockRejectedValueOnce(new Error('commit failed'));
    await expect(applyReviewRecognition(session, proposal, signal())).rejects.toThrow(
      'commit failed'
    );
    const receipt = proposal.receipt;
    await session.saveAdvanced({
      ...session.getSnapshot().snapshot.workspace.advanced,
      ...session.getSnapshot().document.advancedContent,
      audio: {
        ...session.getSnapshot().document.advancedContent.audio,
        original: { muted: false, volume: 0.3 },
      },
    });
    deps.readVideoWorkspace.mockResolvedValueOnce(null);
    await expect(applyReviewRecognition(session, proposal, signal())).rejects.toThrow(
      'unavailable'
    );
    expect(proposal.receipt).toBe(receipt);
    expect(deps.commitVideoWorkspace).toHaveBeenCalledOnce();
    await applyReviewRecognition(session, proposal, signal());
    expect(deps.commitVideoWorkspace).toHaveBeenCalledTimes(2);
    expect(proposal.receipt!.after.audio.original.volume).toBe(0.3);
  });
  it('refuses rebasing an absent receipt after the canonical text basis changes', async () => {
    const { session, deps } = fixture();
    const proposal = await runReviewRecognition(session, await prepare(session), signal());
    deps.commitVideoWorkspace.mockRejectedValueOnce(new Error('commit failed'));
    await expect(applyReviewRecognition(session, proposal, signal())).rejects.toThrow(
      'commit failed'
    );
    const receipt = proposal.receipt;
    const added = addReviewTextFragment(createReviewTextDocument(), {
      id: 'manual',
      start: 0,
      end: 1,
      text: 'Manual',
    });
    if (!added.ok) throw new Error('fixture');
    await session.saveAdvanced({
      ...session.getSnapshot().snapshot.workspace.advanced,
      ...session.getSnapshot().document.advancedContent,
      text: added.document,
    });
    await expect(applyReviewRecognition(session, proposal, signal())).rejects.toThrow('stale');
    expect(proposal.receipt).toBe(receipt);
    expect(deps.commitVideoWorkspace).toHaveBeenCalledOnce();
    expect(remote.job).toHaveBeenCalledTimes(3);
  });
  it.each([false, true])(
    'recovers absent Apply after gain edits, autosave=%s',
    async (autosave) => {
      const { session, deps } = fixture();
      session.setAutosaveEnabled(autosave);
      const proposal = await runReviewRecognition(session, await prepare(session), signal());
      deps.commitVideoWorkspace.mockRejectedValueOnce(new Error('commit failed'));
      await expect(applyReviewRecognition(session, proposal, signal())).rejects.toThrow(
        'commit failed'
      );
      const receiptId = proposal.receipt!.id;
      await session.saveAdvanced({
        ...session.getSnapshot().snapshot.workspace.advanced,
        ...session.getSnapshot().document.advancedContent,
        audio: {
          ...session.getSnapshot().document.advancedContent.audio,
          original: { muted: false, volume: 0.45 },
        },
      });
      expect(session.getSnapshot().autosaveEnabled).toBe(autosave);
      if (!autosave) expect(session.getSnapshot().dirty).toBe(true);
      await applyReviewRecognition(session, proposal, signal());
      expect(proposal.receipt!.id).toBe(receiptId);
      expect(proposal.receipt!.before.audio.original.volume).toBe(0.45);
      expect(proposal.receipt!.after.audio.original.volume).toBe(0.45);
      expect(session.getSnapshot().document.advancedContent.text?.fragments).toHaveLength(3);
      expect(session.getSnapshot()).toMatchObject({ autosaveEnabled: autosave, dirty: false });
      expect(deps.commitVideoWorkspace).toHaveBeenCalledTimes(2);
      expect(remote.job).toHaveBeenCalledTimes(3);
      expect((await session.readRetainedReviewOperation(receiptId))?.after).toEqual(
        proposal.receipt!.after
      );
    }
  );
});

it('retains a long text-only response in admissible coarse fragments without invented timing', () => {
  const text = Array.from({ length: 1300 }, () => 'transcription').join(' ');
  const phrases = reviewRecognitionPhrases(
    [{ range: 0, start: 0, end: 700, result: { text } }],
    'sentences'
  );
  expect(phrases.length).toBeGreaterThan(1);
  expect(phrases.map((phrase) => phrase.text).join(' ')).toBe(text);
  expect(
    phrases.every(
      (phrase) =>
        phrase.text.length <= 16000 &&
        phrase.alignment === 'range' &&
        phrase.start === 0 &&
        phrase.end === 700
    )
  ).toBe(true);
});

it('admits a maximum audio-chat native selection at a late offset and refuses an extra sample', async () => {
  const { session } = fixture(11000);
  const selection = { start: 10000, end: 10000 + AUDIO_INPUT_MAX_SECONDS };
  const recognition = { mode: 'transcribe' as const, granularity: 'sentence' as const, prompt: '' };
  const job = await prepare(session, { selection, recognition });
  expect(job.chunks).toEqual([expect.objectContaining(selection)]);
  await expect(
    prepare(session, {
      selection: { ...selection, end: selection.end + 1 / 16000 },
      recognition,
    })
  ).rejects.toThrow('too-large');
});
