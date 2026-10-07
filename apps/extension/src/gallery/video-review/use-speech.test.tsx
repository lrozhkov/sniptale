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
  saveReviewSpeechTranscript: mocks.save,
  generateReviewSpeech: mocks.generate,
  cleanupReviewSpeechPreview: mocks.cleanup,
  applyReviewSpeech: mocks.apply,
  reviewSpeechGeometry: () => 'geometry',
}));
import { useReviewSpeech } from './use-speech';
let root: Root | undefined;
let host: HTMLDivElement;
let current: ReturnType<typeof useReviewSpeech>;
function fixture() {
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
    document: {
      advancedContent: {
        audio: { voiceover: [{ id: 'clip', assetId: 'project-asset:original', transcript }] },
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
    async (_session: ReviewSpeechSession, _clipId: string, next: ReviewSpeechTranscript) => {
      state = {
        document: {
          advancedContent: {
            audio: {
              voiceover: [{ id: 'clip', assetId: 'project-asset:original', transcript: next }],
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
    clipId: 'clip',
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
    guard,
    onFailure,
    getTranscript: () => state.document.advancedContent.audio.voiceover[0]!.transcript,
    setTranscript: async (next: ReviewSpeechTranscript) => mocks.save(session, 'clip', next),
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
      clipId: 'clip',
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
    scope: {},
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
    'clip',
    [preview],
    expect.any(AbortSignal)
  );
  expect(current.previews).toEqual([]);
  expect(mocks.cleanup).toHaveBeenCalledWith(preview);
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
