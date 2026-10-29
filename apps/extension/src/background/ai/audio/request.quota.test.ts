import { afterEach, expect, it, vi } from 'vitest';
import { requestAudio } from './request';
import { AUDIO_OUTPUT_MAX_BYTES, type AudioJobStart } from '../../../contracts/ai/audio';
import type { AudioModelConfig } from './model-config';

const scope = {
  workspaceId: 'w',
  workspaceRevision: 1,
  target: { kind: 'voiceover' as const, clipId: 'c' },
  assetId: 'a',
  nativeStart: 0,
  nativeEnd: 1,
};
const speech: AudioJobStart = {
  type: 'start',
  requestId: 'r',
  operation: 'speech',
  modelId: 'm',
  scope,
  phraseId: 'p',
  textRevision: 1,
  text: 'hello',
  profile: { voiceId: 'voice', responseFormat: 'mp3' },
};
const transcription: AudioJobStart = {
  type: 'start',
  requestId: 'r',
  operation: 'transcription',
  modelId: 'm',
  scope,
};
const speechConfig: AudioModelConfig = {
  connectionType: 'openai-compatible',
  baseUrl: 'https://example.test',
  url: 'https://example.test/audio/speech',
  apiKey: 'fixture',
  modelCode: 'speech',
  speech: speech.profile,
};
const transcriptionConfig: AudioModelConfig = {
  ...speechConfig,
  transcription: { responseFormat: 'json', timestampGranularity: 'none' },
};
const input = new File(['bytes'], 'audio.wav', { type: 'audio/wav' });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function run(request = speech, config = speechConfig) {
  return requestAudio({
    request,
    config,
    ...(request.operation === 'transcription' ? { input } : {}),
    signal: new AbortController().signal,
    onReceiving() {},
  });
}

const quotaCodes = [
  'insufficient_quota',
  'credit_balance_exhausted',
  'organization_spend_limit_exceeded',
  'project_spend_limit_exceeded',
  'organization_usage_limit_exceeded',
];
it.each(['speech', 'transcription'] as const)(
  'retains parsed SDK quota evidence for native %s without a retry or private fields',
  async (operation) => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    for (const code of quotaCodes) {
      fetchMock.mockReset().mockImplementation(async () =>
        Response.json(
          {
            error: { message: 'private-provider-canary', code },
          },
          { status: 429 }
        )
      );
      let failure: unknown;
      try {
        await run(
          operation === 'speech' ? speech : transcription,
          operation === 'speech' ? speechConfig : transcriptionConfig
        );
      } catch (error) {
        failure = error;
      }
      expect(failure).toMatchObject({ reason: 'quota-exceeded', message: 'provider-failed' });
      expect(failure).not.toHaveProperty('cause');
      expect(failure).not.toHaveProperty('data');
      expect(failure).not.toHaveProperty('responseBody');
      expect(JSON.stringify(failure)).not.toContain('private-provider-canary');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  }
);
it.each(['speech', 'transcription'] as const)(
  'keeps unknown or malformed native %s HTTP 429 evidence rate-limited',
  async (operation) => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    for (const body of [
      '{}',
      '<html>insufficient_quota</html>',
      JSON.stringify({
        error: { message: 'insufficient_quota', code: 'slow_down', type: 'rate_limit_error' },
      }),
    ]) {
      fetchMock.mockReset().mockImplementation(
        async () =>
          new Response(body, {
            status: 429,
            headers: { 'Content-Type': 'application/json' },
          })
      );
      await expect(
        run(
          operation === 'speech' ? speech : transcription,
          operation === 'speech' ? speechConfig : transcriptionConfig
        )
      ).rejects.toMatchObject({
        reason: 'rate-limited',
        message: 'provider-rate-limit',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  }
);

it.each(['speech', 'transcription'] as const)(
  'bounds a rejected native %s body before SDK parsing',
  async (operation) => {
    const cancel = vi.fn();
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(new ReadableStream({ cancel }), {
          status: 429,
          headers: { 'Content-Length': String(AUDIO_OUTPUT_MAX_BYTES + 1) },
        })
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      run(
        operation === 'speech' ? speech : transcription,
        operation === 'speech' ? speechConfig : transcriptionConfig
      )
    ).rejects.toThrow('too-large');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  }
);
it.each(['speech', 'transcription'] as const)(
  'preserves explicit cancellation while reading a native %s HTTP 429 body',
  async (operation) => {
    const controller = new AbortController();
    const reached = Promise.withResolvers<void>();
    const fetchMock = vi.fn<typeof fetch>(
      async (_input, init) =>
        new Response(
          new ReadableStream({
            start(body) {
              init?.signal?.addEventListener('abort', () => body.error(init.signal?.reason), {
                once: true,
              });
              reached.resolve();
            },
          }),
          { status: 429 }
        )
    );
    vi.stubGlobal('fetch', fetchMock);
    const pending = requestAudio({
      request: operation === 'speech' ? speech : transcription,
      config: operation === 'speech' ? speechConfig : transcriptionConfig,
      ...(operation === 'transcription' ? { input } : {}),
      signal: controller.signal,
      onReceiving() {},
    });
    await reached.promise;
    const cancelled = new DOMException('Cancelled', 'AbortError');
    controller.abort(cancelled);
    await expect(pending).rejects.toBe(cancelled);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  }
);

it.each(['speech', 'transcription'] as const)(
  'does not interpret native %s SDK messages as internal failure codes',
  async (operation) => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    for (const message of [
      'provider-auth',
      'provider-response-too-large',
      'provider-redirect-refused',
    ]) {
      fetchMock.mockReset().mockImplementation(async () =>
        Response.json(
          {
            error: { message, code: 'credit_balance_exhausted' },
          },
          { status: 429 }
        )
      );
      await expect(
        run(
          operation === 'speech' ? speech : transcription,
          operation === 'speech' ? speechConfig : transcriptionConfig
        )
      ).rejects.toMatchObject({
        reason: 'quota-exceeded',
        message: 'provider-failed',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  }
);
