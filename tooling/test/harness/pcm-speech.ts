import type { AudioJobConsumer } from '../../../apps/extension/src/background/ai/audio/authorization';
import { createAudioJobService } from '../../../apps/extension/src/background/ai/audio/service';
import {
  AUDIO_JOB_PORT_NAME,
  parseAudioJobClientMessage,
  type AudioJobServerMessage,
  type AudioJobStart,
} from '../../../apps/extension/src/contracts/ai/audio';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';

type ResponseMode = 'success' | 'invalid';
type RequestMode = ResponseMode | 'hold';

function fixtureResponse(mode: ResponseMode): Response {
  if (mode === 'invalid')
    return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
  const pcm = new Uint8Array(36_000);
  const view = new DataView(pcm.buffer);
  for (let index = 0; index < pcm.length / 2; index++)
    view.setInt16(
      index * 2,
      Math.round(2000 * Math.sin((2 * Math.PI * 220 * index) / 24_000)),
      true
    );
  return new Response(pcm, { headers: { 'Content-Type': 'audio/pcm; rate=24000; channels=1' } });
}

/** Test-only transport: actual authorization, request parsing, coordinator and OPFS staging remain active. */
export function installPcmSpeechFixture(consumer: AudioJobConsumer = 'gallery') {
  const url = 'https://pcm.fixture.invalid/v1/audio/speech';
  const pending = new Map<number, (mode: ResponseMode) => void>();
  const fixture = {
    mode: 'success' as RequestMode,
    modes: [] as RequestMode[],
    starts: [] as AudioJobStart[],
    requests: [] as Array<{ format: string; text: string }>,
    details: [] as Array<{ mode: RequestMode; aborted: boolean }>,
    release(index: number, mode: ResponseMode = 'success'): boolean {
      const resolve = pending.get(index);
      if (!resolve) return false;
      resolve(mode);
      return true;
    },
  };
  Object.assign(window, { pcmSpeechFixture: fixture });
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const requestedUrl =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (requestedUrl !== url) return originalFetch(input, init);
    if (init?.method !== 'POST' || typeof init.body !== 'string')
      throw new Error('Invalid fixture POST');
    const body: unknown = JSON.parse(init.body);
    if (
      !isRecord(body) ||
      typeof body['response_format'] !== 'string' ||
      typeof body['input'] !== 'string'
    )
      throw new Error('Invalid fixture body');
    const mode = fixture.modes.shift() ?? fixture.mode;
    const index = fixture.requests.length;
    const request = {
      format: body['response_format'],
      text: body['input'],
    };
    const detail = { mode, aborted: false };
    fixture.requests.push(request);
    fixture.details.push(detail);
    if (mode !== 'hold') return fixtureResponse(mode);
    return new Promise<Response>((resolve, reject) => {
      const cleanup = () => {
        pending.delete(index);
        init.signal?.removeEventListener('abort', aborted);
      };
      const aborted = () => {
        detail.aborted = true;
        cleanup();
        reject(new DOMException('Cancelled fixture', 'AbortError'));
      };
      pending.set(index, (responseMode) => {
        cleanup();
        resolve(fixtureResponse(responseMode));
      });
      if (init.signal?.aborted) aborted();
      else init.signal?.addEventListener('abort', aborted, { once: true });
    });
  };
  const service = createAudioJobService({
    resolveModel: async (request) => {
      if (request.operation !== 'speech') throw new Error('invalid-request');
      return {
        connectionType: 'openai-compatible',
        baseUrl: 'https://pcm.fixture.invalid/v1',
        url,
        apiKey: 'fixture-only-no-secret',
        modelCode: 'fixture-tts',
        speech: request.profile,
      };
    },
  });
  const originalConnect = chrome.runtime.connect.bind(chrome.runtime);
  Object.assign(chrome.runtime, {
    connect(options: { name?: string } = {}) {
      if (options.name !== AUDIO_JOB_PORT_NAME) return originalConnect(options);
      const listeners = new Set<(message: AudioJobServerMessage) => void>();
      const disconnected = new Set<() => void>();
      const connection = service.connect((message) => {
        for (const listener of listeners) listener(message);
      }, consumer);
      return {
        name: options.name,
        onMessage: {
          addListener: (listener: (message: AudioJobServerMessage) => void) =>
            listeners.add(listener),
          removeListener: (listener: (message: AudioJobServerMessage) => void) =>
            listeners.delete(listener),
          hasListener: (listener: (message: AudioJobServerMessage) => void) =>
            listeners.has(listener),
        },
        onDisconnect: {
          addListener: (listener: () => void) => disconnected.add(listener),
          removeListener: (listener: () => void) => disconnected.delete(listener),
          hasListener: (listener: () => void) => disconnected.has(listener),
        },
        postMessage(message: unknown) {
          const parsed = parseAudioJobClientMessage(message);
          if (!parsed) throw new Error('Invalid fixture Port frame');
          if (parsed.type === 'start') fixture.starts.push(parsed);
          connection.receive(parsed);
        },
        disconnect() {
          void connection
            .disconnect()
            .catch(() => {})
            .finally(() => {
              for (const listener of disconnected) listener();
            });
        },
      };
    },
  });
  window.addEventListener('pagehide', () => {
    void service.cancelActiveJob().catch(() => {});
  });
}
