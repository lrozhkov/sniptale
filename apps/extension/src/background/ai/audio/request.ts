import {
  AUDIO_INPUT_MAX_BYTES,
  AUDIO_OUTPUT_MAX_BYTES,
  isAudioSourceJobScope,
  type AudioJobStart,
} from '../../../contracts/ai/audio';
import type { AudioModelConfig } from './model-config';
import { parseAudioTranscriptResponse } from './response';

interface AudioRequest {
  request: AudioJobStart;
  config: AudioModelConfig;
  input?: File;
  signal: AbortSignal;
  onReceiving(): void;
}

async function readBounded(
  response: Response,
  limit: number,
  signal: AbortSignal
): Promise<Uint8Array<ArrayBuffer>> {
  const length = response.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > limit)) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error('too-large');
  }
  if (!response.body) throw new Error('invalid-response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const next = await reader.read().catch(() => {
        signal.throwIfAborted();
        throw new Error('network-failed');
      });
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) throw new Error('too-large');
      chunks.push(next.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function encodeTranscription(
  args: AudioRequest,
  headers: Record<string, string>
): Promise<ArrayBuffer> {
  const params = args.config.transcription;
  if (!args.input || !params) throw new Error('invalid-request');
  if (args.input.size > AUDIO_INPUT_MAX_BYTES) throw new Error('too-large');
  args.signal.throwIfAborted();
  const form = new FormData();
  form.set('file', args.input);
  form.set('model', args.config.modelCode);
  form.set('response_format', params.responseFormat);
  if (params.language) form.set('language', params.language);
  if (params.prompt) form.set('prompt', params.prompt);
  if (params.timestampGranularity !== 'none') {
    form.append('timestamp_granularities[]', params.timestampGranularity);
    if (params.timestampGranularity === 'word') form.append('timestamp_granularities[]', 'segment');
  }
  // Materialize the upload before fetch so network I/O never reads a live OPFS file.
  // Response owns multipart encoding and the matching boundary; no headers are guessed.
  const encoded = new Response(form);
  const body = await encoded.arrayBuffer().catch(() => {
    args.signal.throwIfAborted();
    throw new Error('storage-failed');
  });
  args.signal.throwIfAborted();
  const contentType = encoded.headers.get('Content-Type');
  if (!contentType) throw new Error('invalid-request');
  headers['Content-Type'] = contentType;
  return body;
}

function encodeSpeech(args: AudioRequest): string {
  const params = args.config.speech;
  if (args.request.operation !== 'speech' || !params) throw new Error('invalid-request');
  return JSON.stringify({
    model: args.config.modelCode,
    input: args.request.text,
    voice: params.voiceId,
    response_format: params.responseFormat,
    ...(params.speed === undefined ? {} : { speed: params.speed }),
    ...(params.instructions ? { instructions: params.instructions } : {}),
  });
}

async function assertResponseStatus(response: Response): Promise<void> {
  if (response.ok) return;
  await response.body?.cancel().catch(() => undefined);
  if (response.status === 401 || response.status === 403) throw new Error('provider-auth');
  if (response.status === 400 || response.status === 422) throw new Error('provider-request');
  if (response.status === 404 || response.status === 405) throw new Error('provider-not-found');
  if (response.status === 413) throw new Error('too-large');
  if (response.status === 429) throw new Error('provider-rate-limit');
  throw new Error('provider-failed');
}

async function decodeTranscription(response: Response, args: AudioRequest) {
  const scope = args.request.scope;
  if (!isAudioSourceJobScope(scope)) throw new Error('invalid-request');
  const bytes = await readBounded(response, 1024 * 1024, args.signal);
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new Error('invalid-response');
  }
  const result = parseAudioTranscriptResponse(raw, scope.nativeEnd - scope.nativeStart);
  if (!result) throw new Error('invalid-response');
  return { kind: 'transcript' as const, result };
}

async function decodeResponse(response: Response, args: AudioRequest) {
  const mime = response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase();
  const expected =
    args.request.operation === 'transcription'
      ? 'application/json'
      : args.config.speech?.responseFormat === 'wav'
        ? 'audio/wav'
        : 'audio/mpeg';
  const matches = mime === expected || (expected === 'audio/wav' && mime === 'audio/x-wav');
  if (!matches) {
    await response.body?.cancel();
    throw new Error('invalid-response');
  }
  if (args.request.operation === 'transcription') return decodeTranscription(response, args);
  const bytes = await readBounded(response, AUDIO_OUTPUT_MAX_BYTES, args.signal);
  if (bytes.byteLength < 4) throw new Error('invalid-response');
  return { kind: 'audio' as const, blob: new Blob([bytes], { type: expected }) };
}

/** Only this owner constructs bearer headers; requests are never redirected or retried. */
export async function requestAudio(args: AudioRequest) {
  const headers: Record<string, string> = { Authorization: `Bearer ${args.config.apiKey}` };
  const body =
    args.request.operation === 'transcription'
      ? await encodeTranscription(args, headers)
      : encodeSpeech(args);
  if (args.request.operation === 'speech') headers['Content-Type'] = 'application/json';
  args.signal.throwIfAborted();
  const response = await fetch(args.config.url, {
    method: 'POST',
    body,
    headers,
    signal: args.signal,
    redirect: 'error',
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
  }).catch(() => {
    args.signal.throwIfAborted();
    throw new Error('network-failed');
  });
  await assertResponseStatus(response);
  args.onReceiving();
  return decodeResponse(response, args);
}
