import {
  AUDIO_INPUT_MAX_BYTES,
  AUDIO_INPUT_MAX_SECONDS,
  type AudioRecognitionOptions,
  type AudioTranscriptResult,
  AUDIO_OUTPUT_MAX_BYTES,
  isAudioSourceJobScope,
  isProjectAudioJobScope,
  type AudioJobStart,
} from '../../../contracts/ai/audio';
import type { AudioModelConfig } from './model-config';
import { parseAudioTranscriptResponse, validateAudioUpload } from './response';
import { encodeChatTranscription, parseChatTranscription } from './chat-transcription';
import { isSupportedPcmContentType, PCM_WAV_HEADER_BYTES, wrapPcmWav } from './pcm-wav';

interface AudioRequest {
  request: AudioJobStart;
  config: AudioModelConfig;
  input?: File;
  signal: AbortSignal;
  onReceiving(): void;
  /** The coordinator rechecks source and provider authority after asynchronous body preparation. */
  beforeSend?(): Promise<void>;
}

/** Transcribes one admitted private audio input without an editor project scope. */
interface TranscriptionRequest {
  config: AudioModelConfig;
  input: File;
  durationSeconds: number;
  recognition?: AudioRecognitionOptions;
  signal: AbortSignal;
  beforeSend(): Promise<void>;
  onReceiving(): void;
}

type TranscriptionInput = Omit<TranscriptionRequest, 'beforeSend'> & {
  beforeSend?: () => Promise<void>;
};

function transcriptionInput(args: AudioRequest): TranscriptionInput {
  if (
    args.request.operation !== 'transcription' ||
    !isAudioSourceJobScope(args.request.scope) ||
    !args.input
  )
    throw new Error('invalid-request');
  return {
    config: args.config,
    input: args.input,
    durationSeconds: args.request.scope.nativeEnd - args.request.scope.nativeStart,
    ...(args.request.recognition ? { recognition: args.request.recognition } : {}),
    signal: args.signal,
    ...(args.beforeSend ? { beforeSend: args.beforeSend } : {}),
    onReceiving: args.onReceiving,
  };
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
  args: TranscriptionInput,
  headers: Record<string, string>
): Promise<ArrayBuffer> {
  const params = args.config.transcription;
  if (!args.input || !params) throw new Error('invalid-request');
  if (args.input.size > AUDIO_INPUT_MAX_BYTES) throw new Error('too-large');
  args.signal.throwIfAborted();
  if (params.transport === 'audio-chat') {
    if (!args.recognition) throw new Error('invalid-request');
    const bytes = new Uint8Array(await args.input.arrayBuffer());
    args.signal.throwIfAborted();
    // Bounded blocks avoid spreading the complete audio into the JavaScript argument stack.
    const parts: string[] = [];
    // All nonfinal blocks contain a multiple of three bytes, so their base64 has no internal padding.
    for (let offset = 0; offset < bytes.length; offset += 32766)
      parts.push(btoa(String.fromCharCode(...bytes.subarray(offset, offset + 32766))));
    const payload = encodeChatTranscription(
      args.config,
      args.recognition,
      args.durationSeconds,
      parts.join('')
    );
    args.signal.throwIfAborted();
    headers['Content-Type'] = 'application/json';
    return new TextEncoder().encode(payload).buffer;
  }
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

async function decodeTranscription(response: Response, args: TranscriptionInput) {
  const bytes = await readBounded(response, 1024 * 1024, args.signal);
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new Error('invalid-response');
  }
  const result =
    args.config.transcription?.transport === 'audio-chat'
      ? args.recognition
        ? parseChatTranscription(raw, args.durationSeconds, args.recognition)
        : null
      : parseAudioTranscriptResponse(raw, args.durationSeconds);
  if (!result) throw new Error('invalid-response');
  return result;
}

async function decodeResponse(response: Response, args: AudioRequest) {
  if (args.request.operation === 'speech' && args.config.speech?.responseFormat === 'pcm') {
    if (!isSupportedPcmContentType(response.headers.get('Content-Type'))) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error('invalid-response');
    }
    const pcm = await readBounded(
      response,
      AUDIO_OUTPUT_MAX_BYTES - PCM_WAV_HEADER_BYTES,
      args.signal
    );
    args.signal.throwIfAborted();
    const blob = wrapPcmWav(pcm);
    args.signal.throwIfAborted();
    return { kind: 'audio' as const, blob };
  }
  const mime = response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase();
  const expected = args.config.speech?.responseFormat === 'wav' ? 'audio/wav' : 'audio/mpeg';
  const matches = mime === expected || (expected === 'audio/wav' && mime === 'audio/x-wav');
  if (!matches) {
    await response.body?.cancel();
    throw new Error('invalid-response');
  }
  const bytes = await readBounded(response, AUDIO_OUTPUT_MAX_BYTES, args.signal);
  if (bytes.byteLength < 4) throw new Error('invalid-response');
  return { kind: 'audio' as const, blob: new Blob([bytes], { type: expected }) };
}

interface AudioProviderRequest {
  config: AudioModelConfig;
  signal: AbortSignal;
  beforeSend?: () => Promise<void>;
  onReceiving(): void;
}

async function postAudioProvider(
  args: AudioProviderRequest,
  headers: Record<string, string>,
  body: ArrayBuffer | string
): Promise<Response> {
  args.signal.throwIfAborted();
  await args.beforeSend?.();
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
  return response;
}

async function performTranscription(args: TranscriptionInput): Promise<AudioTranscriptResult> {
  const headers: Record<string, string> = { Authorization: `Bearer ${args.config.apiKey}` };
  const body = await encodeTranscription(args, headers);
  const response = await postAudioProvider(args, headers, body);
  if (
    response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
  ) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error('invalid-response');
  }
  return decodeTranscription(response, args);
}

/** Rechecks caller authority after upload preparation. This request never redirects or retries. */
export async function requestTranscription(
  args: TranscriptionRequest
): Promise<AudioTranscriptResult> {
  args.signal.throwIfAborted();
  if (
    !Number.isFinite(args.durationSeconds) ||
    args.durationSeconds <= 0 ||
    args.durationSeconds > AUDIO_INPUT_MAX_SECONDS ||
    args.input.size === 0 ||
    args.input.size > AUDIO_INPUT_MAX_BYTES
  )
    throw new Error('too-large');
  const wav = args.input.type === 'audio/wav';
  const mediaTypeParts = args.input.type.toLowerCase().split(';');
  const webm =
    mediaTypeParts[0] === 'audio/webm' &&
    (mediaTypeParts.length === 1 ||
      (mediaTypeParts.length === 2 && mediaTypeParts[1]?.trimStart() === 'codecs=opus'));
  if (
    (!wav && !webm) ||
    (wav && !(await validateAudioUpload(args.input, args.durationSeconds))) ||
    (!wav && args.config.transcription?.transport === 'audio-chat')
  )
    throw new Error('invalid-request');
  return performTranscription(args);
}

/** Editor callers retain their real source scope and existing coordinator admission. */
export async function requestAudio(args: AudioRequest) {
  if (isProjectAudioJobScope(args.request.scope) && !args.beforeSend)
    throw new Error('unauthorized');
  if (args.request.operation === 'transcription') {
    return {
      kind: 'transcript' as const,
      result: await performTranscription(transcriptionInput(args)),
    };
  }
  const headers = {
    Authorization: `Bearer ${args.config.apiKey}`,
    'Content-Type': 'application/json',
  };
  const response = await postAudioProvider(args, headers, encodeSpeech(args));
  return decodeResponse(response, args);
}
