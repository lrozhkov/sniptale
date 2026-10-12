// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { reviewSpeechTextSignature } from '../../features/video/review/speech-transcript';
import type { ReviewSpeechTranscript } from '../../features/video/review/speech-transcript';
import type { ReviewSpeechSession } from '../../workflows/video-review/speech-publication';
import { createReviewSpeechEditGuard } from './speech-edit-guard';
const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  generate: vi.fn(),
  cleanup: vi.fn(),
  transcribe: vi.fn(),
  apply: vi.fn(),
}));
vi.mock('../../workflows/ai-settings/query', () => ({
  requestAIModelSelectionBootstrap: async () => ({
    models: [],
    providers: [],
    defaultModelId: null,
    chromeAiEnabled: false,
    globalSystemPrompt: '',
  }),
}));
vi.mock('../../workflows/video-review/asset-bytes', () => ({
  resolveReviewAssetBytes: async () => null,
}));
vi.mock('../../workflows/video-review/speech-transcription', () => ({
  transcribeReviewSpeech: mocks.transcribe,
}));
vi.mock('../../workflows/video-review/speech-publication', () => ({
  getReviewSpeechTarget: (
    session: ReviewSpeechSession,
    target: import('../../contracts/ai/audio').ReviewSpeechTarget
  ) => {
    const state = session.getSnapshot();
    if (target.kind === 'original')
      return {
        assetId: 'source',
        transcript: state.document.advancedContent.audio.originalSpeech?.transcript,
        nativeStart: 0,
        nativeEnd: 4,
      };
    const clip = state.document.advancedContent.audio.voiceover.find(
      (entry) => entry.id === target.clipId
    );
    return clip
      ? {
          assetId: clip.assetId,
          transcript: clip.transcript,
          nativeStart: clip.sourceOffset,
          nativeEnd: clip.sourceOffset + clip.duration,
        }
      : undefined;
  },
  saveReviewSpeechTranscript: mocks.save,
  generateReviewSpeech: mocks.generate,
  cleanupReviewSpeechPreview: mocks.cleanup,
  applyReviewSpeechBatch: mocks.apply,
  reviewSpeechGeometry: () => 'geometry',
}));
import { useReviewSpeech } from './use-speech';
let root: Root | undefined;
let host: HTMLDivElement;
let current: ReturnType<typeof useReviewSpeech>;
function fixture(clips = 1) {
  const transcript: ReviewSpeechTranscript = {
    version: 1,
    phrases: [
      {
        id: 'phrase',
        start: 0,
        end: 4,
        text: 'Hello world',
        originalText: 'Hello world',
        revision: 0,
        alignment: 'range',
      },
    ],
    replacements: [],
    profile: { modelId: 'model', voiceId: 'voice', responseFormat: 'wav' },
  };
  let state = {
    snapshot: {
      workspace: { aggregateId: 'workspace', sourceAssetId: 'source', source: { duration: 12 } },
    },
    document: {
      edits: [],
      advancedContent: {
        audio: {
          voiceover: Array.from({ length: clips }, (_, index) => ({
            id: index === 0 ? 'clip' : `clip-${index}`,
            assetId: index === 0 ? 'project-asset:original' : `project-asset:original-${index}`,
            transcript,
            timelineStart: 1,
            sourceOffset: 0,
            duration: 4,
            tempo: 2,
            volume: 1,
            muted: false,
            fadeIn: 0,
            fadeOut: 0,
          })),
        },
      },
    },
  };
  const listeners = new Set<() => void>();
  const session = {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as ReviewSpeechSession;
  mocks.save.mockImplementation(
    async (
      _session: ReviewSpeechSession,
      target: import('../../contracts/ai/audio').ReviewSpeechTarget,
      next: ReviewSpeechTranscript
    ) => {
      state = {
        ...state,
        document: {
          edits: [],
          advancedContent: {
            audio: {
              voiceover: state.document.advancedContent.audio.voiceover.map((clip) =>
                target.kind === 'voiceover' && target.clipId === clip.id
                  ? { ...clip, transcript: next }
                  : clip
              ),
            },
          },
        },
      };
      for (const listener of listeners) listener();
    }
  );
  const onFailure = vi.fn();
  const guard = createReviewSpeechEditGuard(onFailure);
  const args = {
    session,
    target: { kind: 'voiceover' as const, clipId: 'clip' },
    beforeAction: (action: () => void) => {
      void guard.perform(action);
    },
    flushAdvanced: async () => undefined,
    registerSpeechFlush: guard.register,
  };
  function Harness() {
    current = useReviewSpeech(args);
    return <div>{current.transcript.phrases[0]?.text}</div>;
  }
  return {
    Harness,
    args,
    guard,
    onFailure,
    getTranscript: () => state.document.advancedContent.audio.voiceover[0]!.transcript,
    setTranscript: async (next: ReviewSpeechTranscript) => mocks.save(session, args.target, next),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.cleanup.mockResolvedValue(undefined);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root?.unmount());
  host.remove();
});
it('maps voiceover phrase native seconds to the clip result clock', async () => {
  const { Harness } = fixture();
  await act(async () => root?.render(<Harness />));
  expect(current.resultInterval(1, 3)).toEqual({ start: 1.5, end: 2.5 });
  expect(current.resultInterval(4, 6)).toBeNull();
  expect(current.nativeTimeAtResult(1.5)).toBe(1);
  expect(current.nativeTimeAtResult(0.5)).toBeNull();
  expect(current.nativeBounds).toEqual({ start: 0, end: 4 });
});
it('serializes fast text input against the latest durable phrase and flushes before navigation', async () => {
  const { Harness, guard, getTranscript } = fixture();
  await act(async () => root?.render(<Harness />));
  await act(async () => {
    current.editPhrase('phrase', { text: 'One' });
    current.editPhrase('phrase', { text: 'Two' });
    await guard.flush();
  });
  expect(getTranscript().phrases[0]?.text).toBe('Two');
  expect(getTranscript().phrases[0]?.revision).toBe(1);
  expect(current.dirty).toBe(false);
});
it('retains failed text and blocks departure until explicit retry succeeds', async () => {
  const { Harness, guard, getTranscript } = fixture();
  const normal = mocks.save.getMockImplementation();
  mocks.save.mockRejectedValueOnce(new Error('storage'));
  await act(async () => root?.render(<Harness />));
  await act(async () => current.editPhrase('phrase', { text: 'Keep this draft' }));
  expect(current.transcript.phrases[0]?.text).toBe('Keep this draft');
  expect(current.dirty).toBe(true);
  await act(async () => {
    await expect(guard.flush()).rejects.toThrow('storage');
  });
  mocks.save.mockImplementation(normal!);
  await act(async () => guard.flush());
  expect(getTranscript().phrases[0]?.text).toBe('Keep this draft');
  expect(current.dirty).toBe(false);
});
it('rejects invalid boundaries without poisoning the edit queue and accepts corrected profiles', async () => {
  const { Harness, guard, getTranscript } = fixture();
  await act(async () => root?.render(<Harness />));
  await act(async () => current.editPhrase('phrase', { start: 5 }));
  expect(current.dirty).toBe(false);
  expect(mocks.save).not.toHaveBeenCalled();
  await act(async () =>
    current.changeProfile({ modelId: 'model', voiceId: '', responseFormat: 'wav' })
  );
  expect(current.dirty).toBe(true);
  await act(async () => {
    current.changeProfile({ modelId: 'model', voiceId: 'corrected', responseFormat: 'wav' });
    await guard.flush();
  });
  expect(getTranscript().profile?.voiceId).toBe('corrected');
  expect(current.dirty).toBe(false);
});
it('splits only at an explicit native time and aborts requests when the selected clip unmounts', async () => {
  const { Harness, guard, getTranscript } = fixture();
  await act(async () => root?.render(<Harness />));
  await act(async () => {
    current.split('phrase', 5, 1.25);
    await guard.flush();
  });
  expect(getTranscript().phrases.map((phrase) => [phrase.start, phrase.end])).toEqual([
    [0, 1.25],
    [1.25, 4],
  ]);
  let signal: AbortSignal | undefined;
  mocks.generate.mockImplementation(
    (_s: unknown, _c: unknown, _p: unknown, _profile: unknown, value: AbortSignal) => {
      signal = value;
      return new Promise(() => undefined);
    }
  );
  await act(async () => current.generate(['phrase']));
  act(() => root?.unmount());
  root = undefined;
  expect(signal?.aborted).toBe(true);
});

it('drops a disposable preview and follows the profile restored by external history', async () => {
  const { Harness, getTranscript, setTranscript } = fixture();
  await act(async () => root?.render(<Harness />));
  const transcript = getTranscript();
  const profile = transcript.profile!;
  const phrase = transcript.phrases[0]!;
  const preview = {
    replacement: {
      ...phrase,
      id: 'take',
      phraseId: phrase.id,
      assetId: '',
      duration: 1,
      profile,
      textSignature: reviewSpeechTextSignature(phrase.text, profile),
    },
    blob: new Blob(),
    url: 'blob:take',
    scope: {
      workspaceId: 'workspace',
      workspaceRevision: 1,
      target: { kind: 'voiceover' as const, clipId: 'clip' },
      assetId: 'project-asset:original',
      nativeStart: 0,
      nativeEnd: 4,
    },
    staged: { id: 'take', mimeType: 'audio/wav', size: 1 },
    geometry: 'geometry',
    createdAt: Date.now(),
    expiresAt: Date.now() + 60000,
  };
  mocks.generate.mockResolvedValue(preview);
  await act(async () => current.generate(['phrase']));
  expect(current.previews).toHaveLength(1);
  await act(async () =>
    setTranscript({
      ...transcript,
      profile: { ...profile, voiceId: 'restored' },
      phrases: [{ ...phrase, text: 'Restored', revision: 1 }],
    })
  );
  expect(current.previews).toHaveLength(0);
  expect(mocks.cleanup).toHaveBeenCalledWith(preview);
  expect(current.profile?.voiceId).toBe('restored');
});

it('protects invalid profile drafts on unload and allows explicit discard without saving', async () => {
  const { Harness, guard } = fixture();
  await act(async () => root?.render(<Harness />));
  await act(async () =>
    current.changeProfile({ modelId: 'model', voiceId: '', responseFormat: 'wav' })
  );
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  await act(async () => {
    await expect(guard.flush()).rejects.toThrow('invalid');
  });
  await act(async () => current.discardDraft());
  expect(current.profile?.voiceId).toBe('voice');
  expect(current.dirty).toBe(false);
  expect(current.error).toBeNull();
  const cleanUnload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(cleanUnload);
  expect(cleanUnload.defaultPrevented).toBe(false);
  expect(mocks.save).not.toHaveBeenCalled();
});

it('rejects unsupported split points and merges explicit phrase edits durably', async () => {
  const { Harness, guard, getTranscript } = fixture();
  await act(async () => root?.render(<Harness />));
  await act(async () => {
    current.split('missing', 5, 2);
    current.split('phrase', 0, 2);
    current.split('phrase', 50, 2);
  });
  expect(mocks.save).not.toHaveBeenCalled();
  await act(async () => current.split('phrase', 5, 8));
  expect(current.error).toBe('invalid');
  await act(async () => {
    current.split('phrase', 5, 2);
    await guard.flush();
  });
  const right = getTranscript().phrases[1]!.id;
  await act(async () => {
    current.merge('phrase', right);
    await guard.flush();
  });
  expect(getTranscript().phrases).toHaveLength(1);
  expect(current.isChanged('missing')).toBe(false);
  await act(async () => {
    current.restore([]);
    await guard.flush();
  });
  expect(current.dirty).toBe(false);
});

it('requires a transcription model, maps interruption, and retries the explicit recognition command', async () => {
  const { Harness } = fixture();
  await act(async () => root?.render(<Harness />));
  await act(async () => current.recognize());
  expect(current.error).toBe('invalid');
  expect(mocks.transcribe).not.toHaveBeenCalled();
  await act(async () => current.setModelId('transcription'));
  mocks.transcribe.mockRejectedValueOnce(new Error('timeout'));
  await act(async () => current.recognize());
  expect(current.error).toBe('interrupted');
  mocks.transcribe.mockResolvedValueOnce(undefined);
  await act(async () => current.recognize());
  expect(mocks.transcribe).toHaveBeenCalledTimes(2);
  expect(current.error).toBeNull();
  await act(async () => current.reloadModels());
  expect(current.catalogs).not.toBeNull();
});

it('applies only explicitly supplied previews and cleans them after publication', async () => {
  const { Harness, getTranscript } = fixture();
  await act(async () => root?.render(<Harness />));
  const phrase = getTranscript().phrases[0]!;
  const profile = getTranscript().profile!;
  const preview = {
    replacement: {
      ...phrase,
      id: 'take',
      phraseId: phrase.id,
      assetId: '',
      duration: 1,
      profile,
      textSignature: reviewSpeechTextSignature(phrase.text, profile),
    },
    blob: new Blob(),
    url: 'blob:take',
    scope: {
      workspaceId: 'workspace',
      workspaceRevision: 1,
      target: { kind: 'voiceover', clipId: 'clip' },
      assetId: 'project-asset:original',
      nativeStart: 0,
      nativeEnd: 4,
    },
    staged: {},
    geometry: 'geometry',
    createdAt: Date.now(),
    expiresAt: Date.now() + 60000,
  };
  mocks.generate.mockResolvedValueOnce(preview);
  await act(async () => current.generate(['phrase']));
  expect(mocks.apply).not.toHaveBeenCalled();
  mocks.apply.mockResolvedValueOnce(undefined);
  await act(async () => current.apply(current.previews));
  expect(mocks.apply).toHaveBeenCalledWith(
    expect.anything(),
    [{ target: { kind: 'voiceover', clipId: 'clip' }, previews: [preview], originalVolume: 0 }],
    expect.any(AbortSignal),
    { flushAdvanced: expect.any(Function) }
  );
  expect(current.previews).toEqual([]);
  expect(mocks.cleanup).toHaveBeenCalledWith(preview);
});

function batchPreviews() {
  return current.groups.map(
    (group): import('../../workflows/video-review/speech-publication').ReviewSpeechPreview => {
      const phrase = group.transcript.phrases[0]!;
      const profile = group.transcript.profile!;
      const id = group.target.kind === 'voiceover' ? group.target.clipId : 'source';
      return {
        replacement: {
          ...phrase,
          id,
          phraseId: phrase.id,
          assetId: `project-asset:take-${id}`,
          duration: 1,
          profile,
          textSignature: reviewSpeechTextSignature(phrase.text, profile),
        },
        blob: new Blob(['audio']),
        url: `blob:${id}`,
        scope: {
          workspaceId: 'workspace',
          workspaceRevision: 1,
          target: group.target,
          assetId: group.assetId,
          nativeStart: 0,
          nativeEnd: 4,
        },
        staged: { id, mimeType: 'audio/wav', size: 5 },
        geometry: 'geometry',
        createdAt: Date.now(),
        expiresAt: Date.now() + 60000,
      };
    }
  );
}

it('keeps a completed foreign-clip preview after cancelling the next selected phrase', async () => {
  const { Harness } = fixture(2);
  await act(async () => root?.render(<Harness />));
  const previews = batchPreviews();
  let secondSignal: AbortSignal | undefined;
  mocks.generate.mockResolvedValueOnce(previews[1]).mockImplementationOnce(
    (
      _session: unknown,
      _target: unknown,
      _phrase: unknown,
      _profile: unknown,
      signal: AbortSignal
    ) =>
      new Promise((_resolve, reject) => {
        secondSignal = signal;
        signal.addEventListener(
          'abort',
          () => reject(new DOMException('Cancelled', 'AbortError')),
          { once: true }
        );
      })
  );
  await act(async () =>
    current.generateQueue(
      [...current.groups].reverse().map((group) => ({ target: group.target, phraseId: 'phrase' }))
    )
  );
  expect(mocks.generate).toHaveBeenCalledTimes(2);
  expect(current.previews).toEqual([]);
  expect(current.allPreviews).toEqual([previews[1]]);
  expect(current.queueProgress).toMatchObject({ completed: 1, total: 2 });
  await act(async () => current.cancel());
  expect(secondSignal?.aborted).toBe(true);
  expect(current.running).toBe(false);
  expect(current.error).toBe('canceled');
  expect(current.allPreviews).toEqual([previews[1]]);
  expect(mocks.cleanup).not.toHaveBeenCalledWith(previews[1]);
  mocks.apply.mockResolvedValueOnce(undefined);
  await act(async () => current.apply(current.allPreviews));
  expect(mocks.apply.mock.calls[0]?.[1]).toEqual([
    expect.objectContaining({ target: { kind: 'voiceover', clipId: 'clip-1' } }),
  ]);
  expect(current.allPreviews).toEqual([]);
});

it('publishes every selected target together and retains all previews after batch failure', async () => {
  const { Harness } = fixture(2);
  await act(async () => root?.render(<Harness />));
  const previews = batchPreviews();
  mocks.generate.mockResolvedValueOnce(previews[0]).mockResolvedValueOnce(previews[1]);
  await act(async () =>
    current.generateQueue(
      current.groups.map((group) => ({ target: group.target, phraseId: 'phrase' }))
    )
  );
  expect(current.allPreviews).toEqual(previews);
  expect(current.previews).toEqual([previews[0]]);
  mocks.apply.mockRejectedValueOnce(new Error('storage-failed'));
  await act(async () => current.apply(current.allPreviews));
  expect(mocks.apply).toHaveBeenCalledOnce();
  expect(mocks.apply.mock.calls[0]?.[1]).toEqual([
    { target: { kind: 'voiceover', clipId: 'clip' }, previews: [previews[0]], originalVolume: 0 },
    { target: { kind: 'voiceover', clipId: 'clip-1' }, previews: [previews[1]], originalVolume: 0 },
  ]);
  expect(current.error).toBe('storage-failed');
  expect(current.allPreviews).toEqual(previews);
  expect(mocks.cleanup).not.toHaveBeenCalledWith(previews[0]);
  expect(mocks.cleanup).not.toHaveBeenCalledWith(previews[1]);
});

it('cancels an in-flight generation and disposes a late response without presenting it', async () => {
  const { Harness } = fixture();
  await act(async () => root?.render(<Harness />));
  let resolve: (value: unknown) => void = () => undefined;
  let signal: AbortSignal | undefined;
  mocks.generate.mockImplementationOnce((_session, _clipId, _phraseId, _profile, activeSignal) => {
    signal = activeSignal;
    return new Promise((done) => {
      resolve = done;
    });
  });
  await act(async () => current.generate(['phrase']));
  await act(async () => current.cancel());
  expect(signal?.aborted).toBe(true);
  expect(current.error).toBe('canceled');
  const late = { url: 'blob:late' };
  await act(async () => resolve(late));
  expect(current.previews).toEqual([]);
  expect(current.running).toBe(false);
  expect(mocks.cleanup).toHaveBeenCalledWith(late);
});

it('flushes pending typing before an explicit remote command and suppresses it when saving fails', async () => {
  const { Harness, getTranscript } = fixture();
  await act(async () => root?.render(<Harness />));
  await act(async () => current.setModelId('transcription'));
  mocks.transcribe.mockImplementationOnce(async () => {
    expect(getTranscript().phrases[0]?.text).toBe('Latest before command');
  });
  await act(async () => {
    current.editPhrase('phrase', { text: 'Latest before command' });
    current.recognize();
  });
  expect(mocks.transcribe).toHaveBeenCalledOnce();
  expect(current.dirty).toBe(false);
  mocks.save.mockRejectedValueOnce(new Error('storage'));
  await act(async () => {
    current.editPhrase('phrase', { text: 'Retained on failure' });
    current.recognize();
  });
  expect(mocks.transcribe).toHaveBeenCalledOnce();
  expect(current.transcript.phrases[0]?.text).toBe('Retained on failure');
  expect(current.dirty).toBe(true);
});

it.each([
  'provider-auth',
  'provider-rate-limit',
  'permission-denied',
  'model-unavailable',
  'invalid-response',
  'storage-failed',
  'unauthorized',
  'too-large',
] as const)(
  'preserves actionable audio failure %s instead of blaming connection and keys',
  async (code) => {
    const { Harness } = fixture();
    await act(async () => root?.render(<Harness />));
    await act(async () => current.setModelId('transcription'));
    mocks.transcribe.mockRejectedValueOnce(new Error(code));
    await act(async () => current.recognize());
    expect(current.error).toBe(code);
    expect(mocks.transcribe).toHaveBeenCalledOnce();
  }
);

it('dispatches original source selection explicitly and keeps next-apply gain disposable', async () => {
  const { args } = fixture();
  const original = { file: new Blob(['source']), sourceAssetId: 'source' };
  const selection = { start: 1, end: 3 };
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:source');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  function Original() {
    current = useReviewSpeech({ ...args, target: { kind: 'original' }, original, selection });
    return null;
  }
  await act(async () => root?.render(<Original />));
  await act(async () => current.setModelId('stt'));
  await act(async () => current.recognize(true));
  expect(mocks.transcribe).toHaveBeenLastCalledWith(
    args.session,
    { kind: 'original' },
    'stt',
    expect.any(AbortSignal),
    { original, selection }
  );
  await act(async () => current.recognize());
  expect(mocks.transcribe).toHaveBeenLastCalledWith(
    args.session,
    { kind: 'original' },
    'stt',
    expect.any(AbortSignal),
    { original }
  );
  await act(async () => current.setOriginalVolume(0.25));
  expect(mocks.save).not.toHaveBeenCalled();
  await act(async () => current.apply([]));
  expect(mocks.apply).not.toHaveBeenCalled();
  expect(current.originalVolume).toBe(0.25);
  expect(current.recognitionDuration).toBe(4);
  expect(current.selectionDuration).toBe(2);
  await act(async () => root?.render(null));
  expect(revoke).toHaveBeenCalledWith('blob:source');
  create.mockRestore();
  revoke.mockRestore();
});
