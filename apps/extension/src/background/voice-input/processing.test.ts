import { beforeEach, expect, it, vi } from 'vitest';
import type {
  VoiceHistoryEntry,
  VoiceHistoryScope,
  VoiceInputPreferences,
} from '@sniptale/runtime-contracts/voice-input';
import { VoiceHistoryError } from '../../composition/persistence/voice-input-history';
import { createVoiceInputProcessor } from './processing';
import { createVoiceInputProcessingOperations } from './processing-operation';
import {
  createHistoryFixture,
  publish,
} from '../../composition/persistence/voice-input-history/test-support';
import { resolveTranscriptionModelConfig, type AudioModelConfig } from '../ai/audio/model-config';
import { requestTranscription } from '../ai/audio/request';

vi.mock('../ai/audio/model-config', () => ({ resolveTranscriptionModelConfig: vi.fn() }));
vi.mock('../ai/audio/request', () => ({ requestTranscription: vi.fn() }));

const selection = {
  modelId: 'asr',
  approvedProviderId: 'provider',
  approvedDestination: `sha256:${'a'.repeat(64)}`,
  approvedModelCode: 'whisper',
};
const scope: VoiceHistoryScope = {
  entryId: 'entry',
  incarnation: 'inc',
  epoch: 'epoch',
  revision: 1,
  audioDigest: `sha256:${'b'.repeat(64)}`,
};
const entry: VoiceHistoryEntry = {
  ...scope,
  sequence: 1,
  createdAt: 1,
  backend: 'model',
  language: 'ru-RU',
  durationSeconds: 1,
  byteLength: 100,
  mimeType: 'audio/wav',
  rawTranscript: null,
  transcript: null,
  status: 'recorded',
  correctionStatus: 'off',
  failureCode: null,
};
const preferences: VoiceInputPreferences = {
  language: 'ru-RU',
  microphoneDeviceId: null,
  mode: 'local-first',
  backend: 'model',
  transcription: selection,
  correction: {
    enabled: true,
    model: { ...selection, modelId: 'text', approvedModelCode: 'text' },
  },
};
const next = { ...scope, revision: 2 };
const rawScope = { ...scope, revision: 3 };
const history = {
  get: vi.fn(async () => entry),
  readAudio: vi.fn(async () => new File(['audio'], 'private-entry.wav', { type: 'audio/wav' })),
  beginProcessing: vi.fn(async () => next),
  saveRawTranscript: vi.fn(async () => rawScope),
  complete: vi.fn(
    async (
      current: VoiceHistoryScope,
      result: {
        rawTranscript: string;
        transcript: string;
        correctionStatus: VoiceHistoryEntry['correctionStatus'];
      }
    ): Promise<VoiceHistoryEntry> => ({
      ...entry,
      ...current,
      ...result,
      revision: current.revision + 1,
      status: 'ready',
    })
  ),
  fail: vi.fn(async () => ({ ...entry, status: 'failed' as const })),
};
const transcribe = vi.fn(async () => 'Raw words');
const correct = vi.fn(async () => 'Corrected words');
const loadCorrectionPrompt = vi.fn(async () => 'Preserve my meaning');
beforeEach(() => {
  vi.clearAllMocks();
  history.get.mockResolvedValue(entry);
  history.readAudio.mockResolvedValue(
    new File(['audio'], 'private-entry.wav', { type: 'audio/wav' })
  );
  history.beginProcessing.mockResolvedValue(next);
  history.saveRawTranscript.mockResolvedValue(rawScope);
  transcribe.mockResolvedValue('Raw words');
  correct.mockResolvedValue('Corrected words');
  loadCorrectionPrompt.mockResolvedValue('Preserve my meaning');
});
function run(
  args: Partial<Parameters<ReturnType<typeof createVoiceInputProcessor>['run']>[0]> = {}
) {
  return createVoiceInputProcessor({ history, transcribe, correct, loadCorrectionPrompt }).run({
    scope,
    preferences,
    signal: new AbortController().signal,
    ...args,
  });
}
it('saves raw ASR before correction and returns one ready corrected result', async () => {
  await expect(run()).resolves.toMatchObject({
    rawTranscript: 'Raw words',
    transcript: 'Corrected words',
    correctionStatus: 'applied',
    status: 'ready',
  });
  expect(history.saveRawTranscript).toHaveBeenCalledWith(next, 'Raw words');
  expect(history.saveRawTranscript).toHaveBeenCalledBefore(correct);
  expect(correct).toHaveBeenCalledWith(
    expect.objectContaining({ transcript: 'Raw words', prompt: 'Preserve my meaning' })
  );
  expect(transcribe).toHaveBeenCalledOnce();
  expect(correct).toHaveBeenCalledOnce();
});
it('returns the raw transcript when the second model fails without repeating ASR', async () => {
  correct.mockRejectedValueOnce(new Error('provider-failed'));
  await expect(run()).resolves.toMatchObject({
    transcript: 'Raw words',
    rawTranscript: 'Raw words',
    correctionStatus: 'failed',
    status: 'ready',
  });
  expect(transcribe).toHaveBeenCalledOnce();
  expect(correct).toHaveBeenCalledOnce();
});
it('returns raw text when correction configuration or its prompt is unavailable', async () => {
  loadCorrectionPrompt.mockRejectedValueOnce(new Error('storage-failed'));
  await expect(run()).resolves.toMatchObject({
    transcript: 'Raw words',
    correctionStatus: 'failed',
  });
  expect(correct).not.toHaveBeenCalled();
});
it('does not call the second stage after an ASR failure and retains the audio entry', async () => {
  transcribe.mockRejectedValueOnce(new Error('network-failed'));
  await expect(run()).rejects.toThrow('network-failed');
  expect(correct).not.toHaveBeenCalled();
  expect(history.complete).not.toHaveBeenCalled();
  expect(history.fail).toHaveBeenCalledWith(next, { status: 'failed', failureCode: 'network' });
});
it('accepts browser final text without sending audio to an ASR model', async () => {
  await expect(
    run({
      browserTranscript: 'Chrome words',
      preferences: {
        ...preferences,
        backend: 'browser',
        correction: { enabled: false, model: null },
      },
    })
  ).resolves.toMatchObject({ transcript: 'Chrome words', correctionStatus: 'off' });
  expect(transcribe).not.toHaveBeenCalled();
  expect(history.readAudio).not.toHaveBeenCalled();
  expect(correct).not.toHaveBeenCalled();
});
it('retains a long admitted transcript without truncation', async () => {
  const text = 'word '.repeat(5000);
  transcribe.mockResolvedValueOnce(text);
  await expect(
    run({ preferences: { ...preferences, correction: { enabled: false, model: null } } })
  ).resolves.toMatchObject({ transcript: text, rawTranscript: text });
});
it('never publishes a late correction after cancellation', async () => {
  const entered = Promise.withResolvers<void>();
  const result = Promise.withResolvers<string>();
  correct.mockImplementationOnce(() => {
    entered.resolve();
    return result.promise;
  });
  const controller = new AbortController();
  const work = run({ signal: controller.signal });
  const rejected = expect(work).rejects.toThrow();
  await entered.promise;
  controller.abort();
  result.resolve('Late correction');
  await rejected;
  expect(history.complete).not.toHaveBeenCalled();
});
it('refuses a deleted source after ASR without saving or publishing its late text', async () => {
  transcribe.mockImplementationOnce(async () => {
    history.get.mockRejectedValue(new VoiceHistoryError('stale'));
    return 'Late raw words';
  });
  await expect(run()).rejects.toThrow('stale');
  expect(history.saveRawTranscript).not.toHaveBeenCalled();
  expect(correct).not.toHaveBeenCalled();
  expect(history.complete).not.toHaveBeenCalled();
  expect(history.fail).not.toHaveBeenCalled();
});
it('reports recoverable raw text if persistence fails before the second stage', async () => {
  history.saveRawTranscript.mockRejectedValueOnce(new VoiceHistoryError('storage-failed'));
  const onRawTranscript = vi.fn();
  await expect(run({ onRawTranscript })).rejects.toThrow('storage-failed');
  expect(onRawTranscript).toHaveBeenCalledWith('Raw words', next);
  expect(correct).not.toHaveBeenCalled();
  expect(history.fail).not.toHaveBeenCalled();
});

it.each(['', 'x'.repeat(100001)])(
  'marks an unusable ASR result failed without attempting correction',
  async (text) => {
    transcribe.mockResolvedValueOnce(text);
    await expect(run()).rejects.toThrow(text ? 'too-large' : 'no-speech');
    expect(history.fail).toHaveBeenCalledWith(next, {
      status: 'failed',
      failureCode: text ? 'too-large' : 'no-speech',
    });
    expect(correct).not.toHaveBeenCalled();
  }
);
it('reports the current scope after every successful mutation', async () => {
  const onScope = vi.fn();
  const completed = await run({ onScope });
  expect(onScope.mock.calls.map(([current]) => current)).toEqual([next, rawScope, completed]);
});
it('reports a failed revision so cancellation can remove the admitted entry', async () => {
  const failed = { ...entry, ...next, revision: 3, status: 'failed' as const };
  history.fail.mockResolvedValueOnce(failed);
  transcribe.mockRejectedValueOnce(new Error('network-failed'));
  const onScope = vi.fn();
  await expect(run({ onScope })).rejects.toThrow('network-failed');
  expect(onScope).toHaveBeenLastCalledWith(failed);
});
const config: AudioModelConfig = {
  connectionType: 'openai-compatible',
  baseUrl: 'https://provider.test/v1',
  url: 'https://provider.test/v1/audio/transcriptions',
  apiKey: 'fixture-secret',
  modelCode: 'whisper',
  transcription: {
    transport: 'audio-api',
    responseFormat: 'verbose_json',
    language: 'en',
    timestampGranularity: 'none',
  },
};
it('checks credentials again after request preparation and refuses a changed secret before POST', async () => {
  vi.mocked(resolveTranscriptionModelConfig)
    .mockResolvedValueOnce(config)
    .mockResolvedValueOnce({ ...config, apiKey: 'replaced-secret' });
  const post = vi.fn();
  vi.mocked(requestTranscription).mockImplementationOnce(async (args) => {
    await args.beforeSend();
    post();
    return { text: 'Unexpected', segments: [] };
  });
  const processor = createVoiceInputProcessor({ history, correct, loadCorrectionPrompt });
  await expect(
    processor.run({ scope, preferences, signal: new AbortController().signal })
  ).rejects.toThrow('model-unavailable');
  expect(post).not.toHaveBeenCalled();
});
it('refuses provider permission revoked after request preparation before POST', async () => {
  vi.mocked(resolveTranscriptionModelConfig)
    .mockResolvedValueOnce(config)
    .mockRejectedValueOnce(new Error('permission-denied'));
  const post = vi.fn();
  vi.mocked(requestTranscription).mockImplementationOnce(async (args) => {
    await args.beforeSend();
    post();
    return { text: 'Unexpected', segments: [] };
  });
  await expect(
    createVoiceInputProcessor({ history }).run({
      scope,
      preferences,
      signal: new AbortController().signal,
    })
  ).rejects.toThrow('permission-denied');
  expect(post).not.toHaveBeenCalled();
});
it('uses the configured model language and a generic upload filename without the history identity', async () => {
  vi.mocked(resolveTranscriptionModelConfig).mockResolvedValue(config);
  vi.mocked(requestTranscription).mockImplementationOnce(async (args) => {
    expect(args.input.name).toBe('dictation.wav');
    expect(args.config.transcription?.language).toBe('en');
    await args.beforeSend();
    return { text: 'Recognized', segments: [] };
  });
  await expect(
    createVoiceInputProcessor({ history }).run({
      scope,
      preferences: { ...preferences, correction: { enabled: false, model: null } },
      signal: new AbortController().signal,
    })
  ).resolves.toMatchObject({ transcript: 'Recognized' });
});

it('refuses egress when privacy exclusion is reserved during body preparation', async () => {
  vi.mocked(resolveTranscriptionModelConfig).mockResolvedValue(config);
  let reserved = false;
  const post = vi.fn();
  vi.mocked(requestTranscription).mockImplementationOnce(async (args) => {
    reserved = true;
    await args.beforeSend();
    post();
    return { text: 'Unexpected' };
  });
  const beforeSend = vi.fn(() => {
    if (reserved) throw new VoiceHistoryError('stale');
  });
  await expect(
    createVoiceInputProcessor({ history }).run({
      scope,
      preferences,
      beforeSend,
      signal: new AbortController().signal,
    })
  ).rejects.toThrow('stale');
  expect(post).not.toHaveBeenCalled();
  expect(history.complete).not.toHaveBeenCalled();
});

it('records a correction deadline as a failure while preserving the recognized raw text', async () => {
  const entered = Promise.withResolvers<void>();
  const controller = new AbortController();
  correct.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        entered.resolve();
        controller.signal.addEventListener('abort', () => reject(controller.signal.reason), {
          once: true,
        });
      })
  );
  const onRawTranscript = vi.fn();
  const work = run({ signal: controller.signal, onRawTranscript });
  const rejected = expect(work).rejects.toThrow('timeout');
  await entered.promise;
  controller.abort(new Error('timeout'));
  await rejected;
  expect(history.saveRawTranscript).toHaveBeenCalledWith(next, 'Raw words');
  expect(onRawTranscript).toHaveBeenLastCalledWith('Raw words', rawScope);
  expect(history.fail).toHaveBeenCalledWith(rawScope, { status: 'failed', failureCode: 'timeout' });
  expect(history.complete).not.toHaveBeenCalled();
});

it('recovers raw through the real processor and revisioned history after a correction deadline', async () => {
  vi.useFakeTimers();
  try {
    const durable = createHistoryFixture().create();
    await durable.initialize();
    const source = await publish(durable);
    const entered = Promise.withResolvers<void>();
    const processor = createVoiceInputProcessor({
      history: durable,
      transcribe: async () => 'Accepted before deadline',
      loadCorrectionPrompt: async () => 'Preserve meaning',
      correct: (args) =>
        new Promise((_resolve, reject) => {
          entered.resolve();
          args.signal.addEventListener('abort', () => reject(args.signal.reason), { once: true });
        }),
    });
    const operations = createVoiceInputProcessingOperations({
      history: durable,
      processor,
      acquirePermit: () => () => undefined,
      getGeneration: () => 0,
    });
    const work = operations.run({ owner: {}, scope: source, preferences });
    const rejected = expect(work).rejects.toMatchObject({
      code: 'timeout',
      rawTranscript: 'Accepted before deadline',
      scope: { revision: source.revision + 3 },
    });
    await entered.promise;
    await vi.advanceTimersByTimeAsync(120000);
    await rejected;
    expect(await durable.list()).toMatchObject([
      { status: 'failed', failureCode: 'timeout', rawTranscript: 'Accepted before deadline' },
    ]);
  } finally {
    vi.useRealTimers();
  }
});

it('does not apply a saved model correction to Chrome dictation', async () => {
  const saved = { ...preferences, backend: 'browser' as const };
  await expect(
    run({ browserTranscript: 'Chrome words', preferences: saved })
  ).resolves.toMatchObject({
    transcript: 'Chrome words',
    correctionStatus: 'off',
  });
  expect(transcribe).not.toHaveBeenCalled();
  expect(correct).not.toHaveBeenCalled();
  expect(loadCorrectionPrompt).not.toHaveBeenCalled();
  expect(saved.correction?.enabled).toBe(true);
});

it('preserves automatic model language when voice preferences select Russian', async () => {
  const { language: _language, ...automatic } = config.transcription!;
  vi.mocked(resolveTranscriptionModelConfig).mockResolvedValue({
    ...config,
    transcription: automatic,
  });
  vi.mocked(requestTranscription).mockImplementationOnce(async (args) => {
    expect(args.config.transcription).not.toHaveProperty('language');
    await args.beforeSend();
    return { text: 'Automatic language', segments: [] };
  });
  await expect(
    createVoiceInputProcessor({ history }).run({
      scope,
      preferences: { ...preferences, correction: { enabled: false, model: null } },
      signal: new AbortController().signal,
    })
  ).resolves.toMatchObject({ transcript: 'Automatic language' });
});
