import { assertResponseStatus, failAudioProviderRequest } from './failure';
import { getTranscriptionProviderOptions, admitSdkTranscript } from './transcription';
import { generateSpeech } from 'ai';
import { createAIProviderRuntime } from '../providers';
import { createProviderSdkFetch } from '../llm/transport/http';
import {
  AUDIO_JOB_TIMEOUT_MS,
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
import { validateAudioUpload } from './response';
import {
  buildChatTranscriptionCall,
  transformBothubChatRequest,
  parseChatTranscription,
} from './chat-transcription';
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

async function performTranscription(args: TranscriptionInput): Promise<AudioTranscriptResult> {
  if (args.config.transcription?.transport !== 'audio-chat') return transcribeWithProviderSdk(args);
  if (!args.recognition) throw new Error('invalid-request');
  args.signal.throwIfAborted();
  if (args.input.size === 0 || args.input.size > AUDIO_INPUT_MAX_BYTES)
    throw new Error('too-large');
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = new Uint8Array(await args.input.arrayBuffer());
  } catch {
    args.signal.throwIfAborted();
    throw new Error('storage-failed');
  }
  args.signal.throwIfAborted();
  const call = buildChatTranscriptionCall(
    args.config,
    args.recognition,
    args.durationSeconds,
    bytes
  );

  try {
    const provider = createAIProviderRuntime({
      type: args.config.connectionType,
      baseUrl: args.config.baseUrl,
      apiKey: args.config.apiKey,
      operation: 'text',
      fetch: createTranscriptionSdkFetch(args),
      compatibleChat: {
        supportsStructuredOutputs: true,
        ...(args.config.transcription.chatProtocol === 'bothub'
          ? { transformRequestBody: transformBothubChatRequest }
          : {}),
      },
    });
    // The ready-made method exposes the raw body needed for choice-count and refusal admission.
    const result = await provider.languageModel(args.config.modelCode).doGenerate({
      ...call,
      abortSignal: args.signal,
    });
    args.signal.throwIfAborted();
    const admitted = parseChatTranscription(
      result.response?.body,
      args.durationSeconds,
      args.recognition
    );
    if (!admitted) throw new Error('invalid-response');
    return admitted;
  } catch (error) {
    return failAudioProviderRequest(error, args.signal);
  }
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
  return requestSpeech(args);
}

async function requestSpeech(args: AudioRequest) {
  const params = args.config.speech;
  if (args.request.operation !== 'speech' || !params) throw new Error('invalid-request');
  const type = args.config.connectionType;
  const compatible = ['openai-compatible', 'openai', 'neuraldeep', 'lm-studio'].includes(type);
  if (
    (!compatible && params.responseFormat === 'pcm') ||
    (type === 'google' && params.responseFormat !== 'wav') ||
    (type === 'elevenlabs' && params.responseFormat !== 'mp3')
  )
    throw new Error('provider-request');
  let contentType: string | null = null;
  const transport = createProviderSdkFetch({
    baseUrl: args.config.baseUrl,
    timeoutMs: AUDIO_JOB_TIMEOUT_MS,
    maxResponseBytes:
      type === 'google' || type === 'mistral'
        ? Math.ceil(AUDIO_OUTPUT_MAX_BYTES / 3) * 4 + 65536
        : params.responseFormat === 'pcm'
          ? AUDIO_OUTPUT_MAX_BYTES - PCM_WAV_HEADER_BYTES
          : AUDIO_OUTPUT_MAX_BYTES,
    signal: args.signal,
    ...(args.beforeSend ? { beforeSend: args.beforeSend } : {}),
    transport: async (input, init) => {
      let response: Response;
      try {
        response = await fetch(input, init);
      } catch {
        args.signal.throwIfAborted();
        throw new Error('network-failed');
      }
      await assertResponseStatus(response);
      contentType = await admitSpeechResponse(response, type, params.responseFormat);
      args.onReceiving();
      return response;
    },
  });
  try {
    const provider = createAIProviderRuntime({
      type,
      baseUrl: args.config.baseUrl,
      apiKey: args.config.apiKey,
      fetch: transport,
      operation: 'speech',
    });
    const speechModel = provider.speechModel?.(args.config.modelCode);
    if (!speechModel) throw new Error('model-unavailable');
    const result = await generateSpeech({
      model: speechModel,
      text: args.request.text,
      voice: params.voiceId,
      outputFormat: params.responseFormat,
      maxRetries: 0,
      abortSignal: args.signal,
      ...(params.speed === undefined ? {} : { speed: params.speed }),
      ...(params.instructions ? { instructions: params.instructions } : {}),
    });
    args.signal.throwIfAborted();
    const sdkMime = result.audio.mediaType === 'audio/mp3' ? 'audio/mpeg' : result.audio.mediaType;
    const mime = type === 'google' || type === 'mistral' ? sdkMime : contentType;
    return await decodeResponse(
      new Response(new Uint8Array(result.audio.uint8Array), {
        ...(mime ? { headers: { 'Content-Type': mime } } : {}),
      }),
      args
    );
  } catch (error) {
    return failAudioProviderRequest(error, args.signal);
  }
}

async function admitSpeechResponse(
  response: Response,
  type: AudioModelConfig['connectionType'],
  format: NonNullable<AudioModelConfig['speech']>['responseFormat']
): Promise<string | null> {
  const contentType = response.headers.get('Content-Type');
  const mime = contentType?.split(';')[0]?.trim().toLowerCase();
  const valid =
    type === 'google' || type === 'mistral'
      ? mime === 'application/json'
      : format === 'pcm'
        ? isSupportedPcmContentType(contentType)
        : format === 'wav'
          ? mime === 'audio/wav' || mime === 'audio/x-wav'
          : mime === 'audio/mpeg';
  if (!valid) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error('invalid-response');
  }
  return contentType;
}

/** Uses the ready-made V4 provider once and retains documented raw timing data for compatible models. */
async function transcribeWithProviderSdk(args: TranscriptionInput): Promise<AudioTranscriptResult> {
  args.signal.throwIfAborted();
  if (args.input.size === 0 || args.input.size > AUDIO_INPUT_MAX_BYTES)
    throw new Error('too-large');
  const params = args.config.transcription;
  if (!params) throw new Error('invalid-request');
  const providerOptions = getTranscriptionProviderOptions(args.config.connectionType, params);
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = new Uint8Array(await args.input.arrayBuffer());
  } catch {
    args.signal.throwIfAborted();
    throw new Error('storage-failed');
  }
  args.signal.throwIfAborted();

  try {
    const provider = createAIProviderRuntime({
      type: args.config.connectionType,
      baseUrl: args.config.baseUrl,
      apiKey: args.config.apiKey,
      operation: 'transcription',
      fetch: createTranscriptionSdkFetch(args),
    });
    const model = provider.transcriptionModel?.(args.config.modelCode);
    if (!model) throw new Error('model-unavailable');
    const result = await model.doGenerate({
      audio: bytes,
      mediaType: args.input.type,
      providerOptions,
      abortSignal: args.signal,
    });
    args.signal.throwIfAborted();
    return admitSdkTranscript(
      result,
      args.config.connectionType,
      params.timestampGranularity,
      args.durationSeconds
    );
  } catch (error) {
    return failAudioProviderRequest(error, args.signal);
  }
}

function createTranscriptionSdkFetch(args: TranscriptionInput): typeof fetch {
  return createProviderSdkFetch({
    baseUrl: args.config.baseUrl,
    signal: args.signal,
    timeoutMs: AUDIO_JOB_TIMEOUT_MS,
    maxResponseBytes: 1024 * 1024,
    ...(args.beforeSend ? { beforeSend: args.beforeSend } : {}),
    transport: async (input, init) => {
      let response: Response;
      try {
        response = await fetch(input, init);
      } catch {
        args.signal.throwIfAborted();
        throw new Error('network-failed');
      }
      await assertResponseStatus(response);
      if (
        response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !==
        'application/json'
      ) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error('invalid-response');
      }
      args.onReceiving();
      return response;
    },
  });
}
