import {
  isValidAIModelOperationConfiguration,
  type AISpeechModelParameters,
} from '../settings/model-operation';

export const AUDIO_JOB_PORT_NAME = 'sniptale-gallery-audio-job';
export const AUDIO_INPUT_MAX_BYTES = 24 * 1024 * 1024;
export const AUDIO_OUTPUT_MAX_BYTES = 32 * 1024 * 1024;
export const AUDIO_STAGING_TTL_MS = 10 * 60 * 1000;
export const AUDIO_JOB_TIMEOUT_MS = 120_000;

/** Durable selection authorized before each one-shot provider operation. */
export interface AudioJobScope {
  workspaceId: string;
  workspaceRevision: number;
  clipId: string;
  assetId: string;
  nativeStart: number;
  nativeEnd: number;
}

export interface AudioStagedHandle {
  id: string;
  mimeType: 'audio/wav' | 'audio/mpeg';
  size: number;
}

export type AudioJobStart = {
  type: 'start';
  requestId: string;
  modelId: string;
  scope: AudioJobScope;
} & (
  | { operation: 'transcription' }
  | {
      operation: 'speech';
      phraseId: string;
      textRevision: number;
      text: string;
      profile: AISpeechModelParameters;
    }
);

export type AudioJobClientMessage =
  | AudioJobStart
  | { type: 'execute'; requestId: string; ticket: string; staged: AudioStagedHandle }
  | { type: 'cancel'; requestId: string };

export type AudioJobFailureCode =
  | 'invalid-request'
  | 'unauthorized'
  | 'stale'
  | 'model-unavailable'
  | 'permission-denied'
  | 'cancelled'
  | 'timeout'
  | 'provider-auth'
  | 'provider-rate-limit'
  | 'provider-failed'
  | 'invalid-response'
  | 'too-large'
  | 'storage-failed'
  | 'interrupted';

export interface AudioTranscriptTiming {
  text: string;
  start: number;
  end: number;
}

/** Provider times remain chunk-relative; extraction owner applies the native offset. */
export interface AudioTranscriptResult {
  text: string;
  segments?: AudioTranscriptTiming[];
  words?: AudioTranscriptTiming[];
}

export type AudioJobServerMessage =
  | { type: 'authorized'; requestId: string; ticket: string; scope: AudioJobScope }
  | { type: 'progress'; requestId: string; phase: 'authorizing' | 'requesting' | 'receiving' }
  | { type: 'transcript'; requestId: string; result: AudioTranscriptResult }
  | { type: 'audio'; requestId: string; staged: AudioStagedHandle }
  | { type: 'failure'; requestId: string; code: AudioJobFailureCode };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function identifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200 &&
    Array.from(value).every((character) => character.charCodeAt(0) >= 32)
  );
}
function revision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
export function isAudioStagingId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value)
  );
}
export function parseAudioJobScope(value: unknown): AudioJobScope | null {
  if (
    !record(value) ||
    !identifier(value['workspaceId']) ||
    !identifier(value['clipId']) ||
    !identifier(value['assetId']) ||
    !revision(value['workspaceRevision']) ||
    typeof value['nativeStart'] !== 'number' ||
    !Number.isFinite(value['nativeStart']) ||
    value['nativeStart'] < 0 ||
    typeof value['nativeEnd'] !== 'number' ||
    !Number.isFinite(value['nativeEnd']) ||
    value['nativeEnd'] <= value['nativeStart'] ||
    value['nativeEnd'] - value['nativeStart'] > 300
  )
    return null;
  return {
    workspaceId: value['workspaceId'],
    workspaceRevision: value['workspaceRevision'],
    clipId: value['clipId'],
    assetId: value['assetId'],
    nativeStart: value['nativeStart'],
    nativeEnd: value['nativeEnd'],
  };
}
export function parseAudioJobClientMessage(value: unknown): AudioJobClientMessage | null {
  if (!record(value) || !identifier(value['requestId'])) return null;
  const requestId = value['requestId'];
  if (value['type'] === 'cancel') return { type: 'cancel', requestId };
  if (value['type'] === 'execute') {
    const staged = parseAudioStagedHandle(value['staged']);
    return isAudioStagingId(value['ticket']) &&
      staged?.id === value['ticket'] &&
      staged.mimeType === 'audio/wav' &&
      staged.size <= AUDIO_INPUT_MAX_BYTES
      ? { type: 'execute', requestId, ticket: value['ticket'], staged }
      : null;
  }
  if (value['type'] !== 'start' || !identifier(value['modelId'])) return null;
  const scope = parseAudioJobScope(value['scope']);
  if (!scope) return null;
  const base = { type: 'start' as const, requestId, modelId: value['modelId'], scope };
  if (value['operation'] === 'transcription') return { ...base, operation: 'transcription' };
  if (
    value['operation'] !== 'speech' ||
    !identifier(value['phraseId']) ||
    !revision(value['textRevision']) ||
    typeof value['text'] !== 'string' ||
    !value['text'].trim() ||
    value['text'].length > 4096
  )
    return null;
  const config = { operation: 'speech', audio: { speech: value['profile'] } };
  if (!isValidAIModelOperationConfiguration(config) || !config.audio?.speech) return null;
  return {
    ...base,
    operation: 'speech',
    phraseId: value['phraseId'],
    textRevision: value['textRevision'],
    text: value['text'],
    profile: config.audio.speech,
  };
}
export function sameAudioJobScope(left: AudioJobScope, right: AudioJobScope): boolean {
  return (
    left.workspaceId === right.workspaceId &&
    left.workspaceRevision === right.workspaceRevision &&
    left.clipId === right.clipId &&
    left.assetId === right.assetId &&
    left.nativeStart === right.nativeStart &&
    left.nativeEnd === right.nativeEnd
  );
}

export function parseAudioStagedHandle(value: unknown): AudioStagedHandle | null {
  if (
    !record(value) ||
    !isAudioStagingId(value['id']) ||
    (value['mimeType'] !== 'audio/wav' && value['mimeType'] !== 'audio/mpeg') ||
    typeof value['size'] !== 'number' ||
    !Number.isSafeInteger(value['size']) ||
    value['size'] <= 0 ||
    value['size'] > AUDIO_OUTPUT_MAX_BYTES
  )
    return null;
  return { id: value['id'], mimeType: value['mimeType'], size: value['size'] };
}

function parseTranscript(value: unknown): AudioTranscriptResult | null {
  if (!record(value) || typeof value['text'] !== 'string' || value['text'].length > 100000)
    return null;
  const result: AudioTranscriptResult = { text: value['text'] };
  for (const key of ['segments', 'words'] as const) {
    const entries = value[key];
    if (entries === undefined) continue;
    if (!Array.isArray(entries) || entries.length > 10000) return null;
    const parsed: AudioTranscriptTiming[] = [];
    for (const item of entries) {
      if (
        !record(item) ||
        typeof item['text'] !== 'string' ||
        item['text'].length > 100000 ||
        typeof item['start'] !== 'number' ||
        !Number.isFinite(item['start']) ||
        item['start'] < 0 ||
        typeof item['end'] !== 'number' ||
        !Number.isFinite(item['end']) ||
        item['end'] <= item['start'] ||
        item['end'] > 300
      )
        return null;
      parsed.push({ text: item['text'], start: item['start'], end: item['end'] });
    }
    result[key] = parsed;
  }
  return result;
}
/** Page receiver validates every service-worker frame before updating local workflow state. */
export function parseAudioJobServerMessage(value: unknown): AudioJobServerMessage | null {
  if (!record(value) || !identifier(value['requestId'])) return null;
  const requestId = value['requestId'];
  if (value['type'] === 'authorized') {
    const scope = parseAudioJobScope(value['scope']);
    return scope && isAudioStagingId(value['ticket'])
      ? { type: 'authorized', requestId, scope, ticket: value['ticket'] }
      : null;
  }
  if (
    value['type'] === 'progress' &&
    (value['phase'] === 'authorizing' ||
      value['phase'] === 'requesting' ||
      value['phase'] === 'receiving')
  )
    return { type: 'progress', requestId, phase: value['phase'] };
  if (value['type'] === 'transcript') {
    const result = parseTranscript(value['result']);
    return result ? { type: 'transcript', requestId, result } : null;
  }
  if (value['type'] === 'audio') {
    const staged = parseAudioStagedHandle(value['staged']);
    return staged ? { type: 'audio', requestId, staged } : null;
  }
  if (value['type'] === 'failure') {
    const codes: AudioJobFailureCode[] = [
      'invalid-request',
      'unauthorized',
      'stale',
      'model-unavailable',
      'permission-denied',
      'cancelled',
      'timeout',
      'provider-auth',
      'provider-rate-limit',
      'provider-failed',
      'invalid-response',
      'too-large',
      'storage-failed',
      'interrupted',
    ];
    for (const code of codes)
      if (value['code'] === code) return { type: 'failure', requestId, code };
  }
  return null;
}
