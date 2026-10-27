import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { requestAudio, requestTranscription } from './request';
import { wrapPcmWav } from './pcm-wav';
import type { AudioModelConfig } from './model-config';
import { AUDIO_JOB_TIMEOUT_MS, type AudioJobStart } from '../../../contracts/ai/audio';

const { admit, commit } = vi.hoisted(() => ({ admit: vi.fn(), commit: vi.fn() }));
vi.mock('../../../composition/persistence/ai-settings/graph-mutations', () => ({
  admitStoredAIOperation: admit,
  commitStoredAIOperation: commit,
}));
const binding = {
  providerId: 'p',
  incarnation: 'i',
  revision: 1,
  credentialRevision: 2,
  destination: 'sha256:test',
};
const receipt = { ...binding, generation: 'g' };
const config: AudioModelConfig = {
  connectionType: 'openai-compatible',
  baseUrl: 'https://example.test/v1',
  url: 'https://example.test/v1/audio/speech',
  apiKey: 'private-key-canary',
  modelCode: 'fixture',
  observationBinding: binding,
  speech: { voiceId: 'voice', responseFormat: 'mp3' },
  transcription: { responseFormat: 'json', timestampGranularity: 'none' },
};
const request: AudioJobStart = {
  type: 'start',
  requestId: 'request',
  operation: 'speech',
  modelId: 'model',
  scope: {
    workspaceId: 'w',
    workspaceRevision: 1,
    target: { kind: 'voiceover', clipId: 'c' },
    assetId: 'a',
    nativeStart: 0,
    nativeEnd: 1,
  },
  phraseId: 'p',
  textRevision: 1,
  text: 'private-text-canary',
  profile: config.speech!,
};
const fetchMock = vi.fn<typeof fetch>();
function speech(beforeSend = vi.fn(async () => {}), signal = new AbortController().signal) {
  return requestAudio({ request, config, signal, beforeSend, onReceiving() {} });
}
function input() {
  return new File([wrapPcmWav(new Uint8Array(48000))], 'audio.wav', { type: 'audio/wav' });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  admit.mockResolvedValue(receipt);
  commit.mockResolvedValue(true);
  fetchMock.mockImplementation(
    async () =>
      new Response(new Uint8Array([1, 2, 3, 4]), { headers: { 'Content-Type': 'audio/mpeg' } })
  );
});
afterEach(() => vi.unstubAllGlobals());

it('publishes speech success once and rechecks source after advisory admission', async () => {
  const beforeSend = vi.fn(async () => {});
  const result = await speech(beforeSend);
  expect(result.kind).toBe('audio');
  expect(beforeSend).toHaveBeenCalledTimes(2);
  expect(admit).toHaveBeenCalledWith(binding);
  expect(commit).toHaveBeenCalledWith(receipt, { kind: 'success' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(commit.mock.calls)).not.toContain('private-');
});

it.each([false, true])(
  'publishes native or audio-chat transcription success (chat: %s)',
  async (chat) => {
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify(
            chat
              ? {
                  choices: [
                    {
                      finish_reason: 'stop',
                      message: { content: '{"segments":[{"text":"Hello.","start":0,"end":1}]}' },
                    },
                  ],
                }
              : { text: 'Hello.' }
          ),
          { headers: { 'Content-Type': 'application/json' } }
        )
    );
    const result = await requestTranscription({
      config: {
        ...config,
        url: 'https://example.test/v1/audio/transcriptions',
        transcription: {
          responseFormat: 'json',
          timestampGranularity: 'none',
          ...(chat
            ? { transport: 'audio-chat', chatProtocol: 'openai', structuredOutput: 'json_schema' }
            : {}),
        },
      },
      input: input(),
      durationSeconds: 1,
      recognition: { mode: 'transcribe', granularity: 'sentence', prompt: '' },
      signal: new AbortController().signal,
      beforeSend: async () => {},
      onReceiving() {},
    });
    expect(result.text).toBe('Hello.');
    expect(commit).toHaveBeenCalledWith(receipt, { kind: 'success' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  }
);

it.each([
  [401, 'invalid-credential'],
  [402, 'quota-exceeded'],
  [403, 'permission-denied'],
  [404, 'model-unavailable'],
] as const)(
  'supplies bounded HTTP %s evidence to the existing connection policy',
  async (status, reason) => {
    fetchMock.mockImplementation(async () => new Response('private-error-body-canary', { status }));
    await expect(speech()).rejects.toMatchObject({ reason });
    expect(commit).toHaveBeenCalledWith(receipt, { kind: 'failure', reason });
    expect(JSON.stringify(commit.mock.calls)).not.toContain('private-');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  }
);

it('does not observe local source refusal before native dispatch', async () => {
  await expect(
    speech(
      vi.fn(async () => {
        throw new Error('stale');
      })
    )
  ).rejects.toBeInstanceOf(Error);
  expect(admit).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('rechecks the source after advisory admission waits', async () => {
  const beforeSend = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('stale'));
  await expect(speech(beforeSend)).rejects.toBeInstanceOf(Error);
  expect(admit).toHaveBeenCalledOnce();
  expect(commit).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('cancellation does not publish provider failure', async () => {
  const controller = new AbortController();
  fetchMock.mockImplementation(async () => {
    controller.abort();
    throw new DOMException('Cancelled', 'AbortError');
  });
  await expect(speech(undefined, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(commit).not.toHaveBeenCalled();
});

it('preserves accepted audio and the safe provider error when metadata storage fails', async () => {
  admit.mockRejectedValueOnce(new Error('Storage refused'));
  expect((await speech()).kind).toBe('audio');
  expect(commit).not.toHaveBeenCalled();
  commit.mockRejectedValueOnce(new Error('Storage refused'));
  expect((await speech()).kind).toBe('audio');
  fetchMock.mockImplementation(
    async () => new Response('private-error-body-canary', { status: 401 })
  );
  commit.mockRejectedValueOnce(new Error('Storage refused'));
  await expect(speech()).rejects.toMatchObject({ reason: 'invalid-credential' });
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it('records bounded network failure after dispatch but not invalid audio output', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('private-network-canary'));
  await expect(speech()).rejects.toThrow('network-failed');
  expect(commit).toHaveBeenCalledWith(receipt, { kind: 'failure', reason: 'network' });
  commit.mockClear();
  fetchMock.mockImplementation(
    async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } })
  );
  await expect(speech()).rejects.toThrow('invalid-response');
  expect(commit).not.toHaveBeenCalled();
});

it.each(['speech', 'transcription'] as const)(
  'keeps the native %s deadline distinct from a network failure',
  async (operation) => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Deadline', 'AbortError')),
            { once: true }
          );
        })
    );
    const pending =
      operation === 'speech'
        ? speech()
        : requestTranscription({
            config,
            input: input(),
            durationSeconds: 1,
            signal: new AbortController().signal,
            beforeSend: async () => {},
            onReceiving() {},
          });
    const rejected = expect(pending).rejects.toThrow('timeout');
    void rejected.catch(() => undefined);
    try {
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
      await vi.advanceTimersByTimeAsync(AUDIO_JOB_TIMEOUT_MS + 1);
      await rejected;
      expect(commit).toHaveBeenCalledWith(receipt, { kind: 'failure', reason: 'timeout' });
    } finally {
      vi.useRealTimers();
    }
  }
);

it('publishes native SDK quota evidence without private error fields or a retry', async () => {
  fetchMock.mockImplementation(async () =>
    Response.json(
      {
        error: { message: 'private-provider-canary', code: 'credit_balance_exhausted' },
      },
      { status: 429 }
    )
  );
  await expect(speech()).rejects.toMatchObject({
    reason: 'quota-exceeded',
    message: 'provider-failed',
  });
  expect(commit).toHaveBeenCalledWith(receipt, { kind: 'failure', reason: 'quota-exceeded' });
  expect(JSON.stringify(commit.mock.calls)).not.toContain('private-');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
