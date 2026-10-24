import { SHA256_DIGEST_PATTERN } from '../protocol/digest';
import {
  VOICE_INPUT_TRANSCRIPT_MAX_CHARS,
  VOICE_HISTORY_LIMIT,
  VOICE_HISTORY_MAX_AUDIO_BYTES,
  VOICE_HISTORY_MAX_DURATION_SECONDS,
  isVoiceInputErrorCode,
  isVoiceInputLanguage,
} from './types';
import type {
  VoiceCaptureToken,
  VoiceHistoryScope,
  VoiceHistoryEntry,
  VoiceHistoryRequest,
  VoiceHistoryServerEvent,
} from './types';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isVoiceHistoryIdentity(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/u.test(value);
}

function integer(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

/** Strict parser for scope values received through storage or IPC. */
export function parseVoiceInputHistoryScope(value: unknown): VoiceHistoryScope | null {
  if (
    !record(value) ||
    Object.keys(value).some(
      (key) => !['entryId', 'incarnation', 'epoch', 'revision', 'audioDigest'].includes(key)
    ) ||
    !isVoiceHistoryIdentity(value['entryId']) ||
    !isVoiceHistoryIdentity(value['incarnation']) ||
    !isVoiceHistoryIdentity(value['epoch']) ||
    !integer(value['revision'], 1) ||
    typeof value['audioDigest'] !== 'string' ||
    !SHA256_DIGEST_PATTERN.test(value['audioDigest'])
  )
    return null;
  return {
    entryId: value['entryId'],
    incarnation: value['incarnation'],
    epoch: value['epoch'],
    revision: value['revision'],
    audioDigest: value['audioDigest'],
  };
}

export function parseVoiceCaptureToken(value: unknown): VoiceCaptureToken | null {
  if (
    !record(value) ||
    Object.keys(value).some(
      (key) => !['entryId', 'incarnation', 'epoch', 'sequence', 'createdAt'].includes(key)
    ) ||
    !isVoiceHistoryIdentity(value['entryId']) ||
    !isVoiceHistoryIdentity(value['incarnation']) ||
    !isVoiceHistoryIdentity(value['epoch']) ||
    !integer(value['sequence'], 1) ||
    !integer(value['createdAt'], 0)
  )
    return null;
  return {
    entryId: value['entryId'],
    incarnation: value['incarnation'],
    epoch: value['epoch'],
    sequence: value['sequence'],
    createdAt: value['createdAt'],
  };
}

export function isVoiceHistoryMimeType(value: unknown): value is VoiceHistoryEntry['mimeType'] {
  return value === 'audio/wav' || value === 'audio/webm' || value === 'audio/webm;codecs=opus';
}

export function isVoiceHistoryText(value: unknown): value is string {
  return typeof value === 'string' && value.length <= VOICE_INPUT_TRANSCRIPT_MAX_CHARS;
}

function parseHistoryAudio(
  value: Record<string, unknown>
): Pick<VoiceHistoryEntry, 'durationSeconds' | 'byteLength' | 'mimeType'> | null {
  const durationSeconds = value['durationSeconds'];
  const byteLength = value['byteLength'];
  const mimeType = value['mimeType'];
  if (
    typeof durationSeconds !== 'number' ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    durationSeconds > VOICE_HISTORY_MAX_DURATION_SECONDS ||
    !integer(byteLength, 1) ||
    byteLength > VOICE_HISTORY_MAX_AUDIO_BYTES ||
    !isVoiceHistoryMimeType(mimeType)
  )
    return null;
  return { durationSeconds, byteLength, mimeType };
}

function parseHistoryResult(
  value: Record<string, unknown>
): Pick<
  VoiceHistoryEntry,
  'rawTranscript' | 'transcript' | 'status' | 'correctionStatus' | 'failureCode'
> | null {
  const rawTranscript = value['rawTranscript'];
  const transcript = value['transcript'];
  const status = value['status'];
  const correctionStatus = value['correctionStatus'];
  const failureCode = value['failureCode'];
  if (
    (rawTranscript !== null && !isVoiceHistoryText(rawTranscript)) ||
    (transcript !== null && !isVoiceHistoryText(transcript)) ||
    (status !== 'recorded' &&
      status !== 'processing' &&
      status !== 'ready' &&
      status !== 'failed' &&
      status !== 'cancelled') ||
    (correctionStatus !== 'off' &&
      correctionStatus !== 'applied' &&
      correctionStatus !== 'failed') ||
    (failureCode !== null && !isVoiceInputErrorCode(failureCode))
  )
    return null;
  return { rawTranscript, transcript, status, correctionStatus, failureCode };
}

/** Stored history excludes provider configuration, credentials and filesystem paths. */
export function parseVoiceHistoryEntry(value: unknown): VoiceHistoryEntry | null {
  if (
    !record(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          'entryId',
          'incarnation',
          'epoch',
          'revision',
          'audioDigest',
          'sequence',
          'createdAt',
          'backend',
          'language',
          'durationSeconds',
          'byteLength',
          'mimeType',
          'rawTranscript',
          'transcript',
          'status',
          'correctionStatus',
          'failureCode',
        ].includes(key)
    )
  )
    return null;
  const scope = parseVoiceInputHistoryScope({
    entryId: value['entryId'],
    incarnation: value['incarnation'],
    epoch: value['epoch'],
    revision: value['revision'],
    audioDigest: value['audioDigest'],
  });
  const audio = parseHistoryAudio(value);
  const result = parseHistoryResult(value);
  if (
    !scope ||
    !audio ||
    !result ||
    !integer(value['sequence'], 1) ||
    !integer(value['createdAt'], 0) ||
    (value['backend'] !== 'browser' && value['backend'] !== 'model') ||
    !isVoiceInputLanguage(value['language'])
  )
    return null;
  return {
    ...scope,
    ...audio,
    ...result,
    sequence: value['sequence'],
    createdAt: value['createdAt'],
    backend: value['backend'],
    language: value['language'],
  };
}

function onlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

/** Settings-only control messages carry identity and revision, never audio or paths. */
export function parseVoiceHistoryRequest(value: unknown): VoiceHistoryRequest | null {
  if (!record(value) || !isVoiceHistoryIdentity(value['requestId'])) return null;
  if (value['type'] === 'list' && onlyKeys(value, ['type', 'requestId']))
    return { type: value['type'], requestId: value['requestId'] };
  if (
    (value['type'] !== 'retry' && value['type'] !== 'delete') ||
    !onlyKeys(value, ['type', 'requestId', 'scope'])
  )
    return null;
  const scope = parseVoiceInputHistoryScope(value['scope']);
  return scope ? { type: value['type'], requestId: value['requestId'], scope } : null;
}

function parseHistoryEntries(value: unknown): VoiceHistoryEntry[] | null {
  if (!Array.isArray(value) || value.length > VOICE_HISTORY_LIMIT) return null;
  const entries: VoiceHistoryEntry[] = [];
  for (const item of value) {
    const entry = parseVoiceHistoryEntry(item);
    if (!entry) return null;
    entries.push(entry);
  }
  return new Set(entries.map((entry) => entry.entryId)).size === entries.length ? entries : null;
}

/** Receives bounded sanitized history metadata from the authorized background owner. */
export function parseVoiceHistoryServerEvent(value: unknown): VoiceHistoryServerEvent | null {
  if (!record(value) || !isVoiceHistoryIdentity(value['requestId'])) return null;
  if (value['type'] === 'list' && onlyKeys(value, ['type', 'requestId', 'entries'])) {
    const entries = parseHistoryEntries(value['entries']);
    return entries ? { type: value['type'], requestId: value['requestId'], entries } : null;
  }
  if (value['type'] === 'entry' && onlyKeys(value, ['type', 'requestId', 'entry'])) {
    const entry = parseVoiceHistoryEntry(value['entry']);
    return entry ? { type: value['type'], requestId: value['requestId'], entry } : null;
  }
  if (
    value['type'] === 'failure' &&
    onlyKeys(value, ['type', 'requestId', 'code']) &&
    isVoiceInputErrorCode(value['code'])
  ) {
    return { type: value['type'], requestId: value['requestId'], code: value['code'] };
  }
  return parseHistoryScopedEvent(value);
}

function parseHistoryScopedEvent(value: Record<string, unknown>): VoiceHistoryServerEvent | null {
  if (!isVoiceHistoryIdentity(value['requestId'])) return null;
  const scope = parseVoiceInputHistoryScope(value['scope']);
  if (!scope) return null;
  if (value['type'] === 'deleted' && onlyKeys(value, ['type', 'requestId', 'scope']))
    return { type: value['type'], requestId: value['requestId'], scope };
  if (
    value['type'] === 'progress' &&
    onlyKeys(value, ['type', 'requestId', 'scope', 'phase']) &&
    (value['phase'] === 'processing-asr' || value['phase'] === 'processing-text')
  ) {
    return { type: value['type'], requestId: value['requestId'], scope, phase: value['phase'] };
  }
  return null;
}
