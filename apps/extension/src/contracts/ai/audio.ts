import {
  isValidAIModelOperationConfiguration,
  type AISpeechModelParameters,
} from '../settings/model-operation';
import { SHA256_DIGEST_PATTERN } from '@sniptale/runtime-contracts/protocol/digest';

export const AUDIO_JOB_PORT_NAME = 'sniptale-gallery-audio-job';
export const AUDIO_INPUT_MAX_BYTES = 24 * 1024 * 1024;
/** Maximum mono PCM16 duration at the extraction rate, including its 44-byte WAV header. */
export const AUDIO_INPUT_MAX_SECONDS = Math.floor((AUDIO_INPUT_MAX_BYTES - 44) / 2) / 16_000;
/**
 * Admit native subtraction error with a 1e-7-second tolerance (0.0016 samples at 16 kHz).
 * This stays below half a PCM sample, so rounded extraction cannot exceed the byte budget.
 */
export function validAudioInputDuration(duration: number): boolean {
  return Number.isFinite(duration) && duration > 0 && duration <= AUDIO_INPUT_MAX_SECONDS + 1e-7;
}

export const AUDIO_OUTPUT_MAX_BYTES = 32 * 1024 * 1024;
export const AUDIO_STAGING_TTL_MS = 10 * 60 * 1000;
export const AUDIO_JOB_TIMEOUT_MS = 120_000;
/** Active Port traffic stays below Chromium's 30-second MV3 idle window. */
export const AUDIO_JOB_KEEPALIVE_MS = 20_000;

export type ReviewSpeechTarget = { kind: 'original' } | { kind: 'voiceover'; clipId: string };

/** Durable selection authorized before each one-shot provider operation. */
export interface AudioSourceJobScope {
  workspaceId: string;
  workspaceRevision: number;
  target: ReviewSpeechTarget;
  assetId: string;
  nativeStart: number;
  nativeEnd: number;
}

/** Authored narration can be voiced without any source audio or synthetic input asset. */
export interface AudioTextJobScope {
  workspaceId: string;
  workspaceRevision: number;
  target: { kind: 'text'; fragmentId: string };
  textRevision: number;
  timingRevision: number;
  start: number;
  end: number;
  timeDomain: 'source' | 'result';
}

/** A saved montage clip authorizes its native source interval, never the complete project mix. */
export interface ProjectAudioSourceJobScope {
  projectId: string;
  projectRevision: number;
  projectUpdatedAt: number;
  target: { kind: 'project-clip'; clipId: string };
  assetId: string;
  nativeStart: number;
  nativeEnd: number;
}

/** Authorizes one saved authored phrase and its disclosed placement basis, never source bytes. */
export interface ProjectAudioTextJobScope {
  projectId: string;
  projectRevision: number;
  projectUpdatedAt: number;
  target: { kind: 'project-text'; documentId: string; fragmentId: string };
  basisHash: string;
}

export type AudioJobScope =
  | AudioSourceJobScope
  | AudioTextJobScope
  | ProjectAudioSourceJobScope
  | ProjectAudioTextJobScope;

/** Distinguishes project authority from Gallery workspace authority for both operations. */
export function isProjectAudioJobScope(
  scope: AudioJobScope
): scope is ProjectAudioSourceJobScope | ProjectAudioTextJobScope {
  return scope.target.kind === 'project-clip' || scope.target.kind === 'project-text';
}

/** Project text has no source asset, extraction interval, or upload ticket. */
export function isProjectAudioTextJobScope(
  scope: AudioJobScope
): scope is ProjectAudioTextJobScope {
  return scope.target.kind === 'project-text';
}

/** Identifies a montage media interval that can authorize source extraction. */
export function isProjectAudioSourceJobScope(
  scope: AudioJobScope
): scope is ProjectAudioSourceJobScope {
  return scope.target.kind === 'project-clip';
}

export function isAudioSourceJobScope(
  scope: AudioJobScope
): scope is AudioSourceJobScope | ProjectAudioSourceJobScope {
  return (
    scope.target.kind === 'original' ||
    scope.target.kind === 'voiceover' ||
    scope.target.kind === 'project-clip'
  );
}

export interface AudioStagedHandle {
  id: string;
  mimeType: 'audio/wav' | 'audio/mpeg';
  size: number;
}

/** Disposable multimodal request options, parsed before provider activation. */
export interface AudioRecognitionOptions {
  mode: 'transcribe' | 'rewrite';
  granularity: 'phrase' | 'sentence' | 'paragraph';
  prompt: string;
}

export function parseAudioRecognitionOptions(value: unknown): AudioRecognitionOptions | null {
  if (
    !record(value) ||
    Object.keys(value).some((key) => !['mode', 'granularity', 'prompt'].includes(key)) ||
    (value['mode'] !== 'transcribe' && value['mode'] !== 'rewrite') ||
    (value['granularity'] !== 'phrase' &&
      value['granularity'] !== 'sentence' &&
      value['granularity'] !== 'paragraph') ||
    typeof value['prompt'] !== 'string' ||
    value['prompt'].length > 10000 ||
    (value['mode'] === 'transcribe' && value['prompt'] !== '')
  )
    return null;
  return { mode: value['mode'], granularity: value['granularity'], prompt: value['prompt'] };
}

export type AudioJobStart = {
  type: 'start';
  requestId: string;
  modelId: string;
  /** The disclosed provider; mandatory for authored synthesis and multimodal recognition. */
  approvedProviderId?: string;
  scope: AudioJobScope;
} & (
  | { operation: 'transcription'; recognition?: AudioRecognitionOptions }
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
  | { type: 'cancel'; requestId: string }
  | { type: 'keepalive'; requestId: string };

export const AUDIO_JOB_FAILURE_CODES = [
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
  'network-failed',
  'provider-request',
  'provider-not-found',
  'secret-unavailable',
  'decode-failed',
] as const;
export type AudioJobFailureCode = (typeof AUDIO_JOB_FAILURE_CODES)[number];

/** Admits only fixed diagnostic categories, never provider text or raw exceptions. */
export function parseAudioJobFailureCode(value: unknown): AudioJobFailureCode | null {
  return AUDIO_JOB_FAILURE_CODES.find((code) => code === value) ?? null;
}

export interface AudioTranscriptTiming {
  text: string;
  originalText?: string;
  start: number;
  /** Equality is admitted for word text only; it is never a durable aligned word interval. */
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
export function parseReviewSpeechTarget(value: unknown): ReviewSpeechTarget | null {
  if (!record(value)) return null;
  const keys = Object.keys(value);
  if (value['kind'] === 'original' && keys.length === 1) return { kind: 'original' };
  if (value['kind'] === 'voiceover' && keys.length === 2 && identifier(value['clipId']))
    return { kind: 'voiceover', clipId: value['clipId'] };
  return null;
}
export function sameReviewSpeechTarget(
  left: ReviewSpeechTarget,
  right: ReviewSpeechTarget
): boolean {
  return left.kind === 'original'
    ? right.kind === 'original'
    : right.kind === 'voiceover' && left.clipId === right.clipId;
}
function parseProjectAudioJobScope(
  value: Record<string, unknown>,
  target: Record<string, unknown>
): ProjectAudioSourceJobScope | null {
  if (
    Object.keys(value).some(
      (key) =>
        ![
          'projectId',
          'projectRevision',
          'projectUpdatedAt',
          'target',
          'assetId',
          'nativeStart',
          'nativeEnd',
        ].includes(key)
    ) ||
    !identifier(value['projectId']) ||
    !revision(value['projectRevision']) ||
    typeof value['projectUpdatedAt'] !== 'number' ||
    !Number.isFinite(value['projectUpdatedAt']) ||
    value['projectUpdatedAt'] < 0 ||
    Object.keys(target).length !== 2 ||
    !identifier(target['clipId']) ||
    !identifier(value['assetId']) ||
    typeof value['nativeStart'] !== 'number' ||
    !Number.isFinite(value['nativeStart']) ||
    value['nativeStart'] < 0 ||
    typeof value['nativeEnd'] !== 'number' ||
    !Number.isFinite(value['nativeEnd']) ||
    value['nativeEnd'] <= value['nativeStart'] ||
    !validAudioInputDuration(value['nativeEnd'] - value['nativeStart'])
  )
    return null;
  return {
    projectId: value['projectId'],
    projectRevision: value['projectRevision'],
    projectUpdatedAt: value['projectUpdatedAt'],
    target: { kind: 'project-clip', clipId: target['clipId'] },
    assetId: value['assetId'],
    nativeStart: value['nativeStart'],
    nativeEnd: value['nativeEnd'],
  };
}

function parseProjectAudioTextJobScope(
  value: Record<string, unknown>,
  target: Record<string, unknown>
): ProjectAudioTextJobScope | null {
  if (
    Object.keys(value).some(
      (key) =>
        !['projectId', 'projectRevision', 'projectUpdatedAt', 'target', 'basisHash'].includes(key)
    ) ||
    !identifier(value['projectId']) ||
    !revision(value['projectRevision']) ||
    typeof value['projectUpdatedAt'] !== 'number' ||
    !Number.isFinite(value['projectUpdatedAt']) ||
    value['projectUpdatedAt'] < 0 ||
    Object.keys(target).length !== 3 ||
    !identifier(target['documentId']) ||
    !identifier(target['fragmentId']) ||
    typeof value['basisHash'] !== 'string' ||
    !SHA256_DIGEST_PATTERN.test(value['basisHash'])
  )
    return null;
  return {
    projectId: value['projectId'],
    projectRevision: value['projectRevision'],
    projectUpdatedAt: value['projectUpdatedAt'],
    target: {
      kind: 'project-text',
      documentId: target['documentId'],
      fragmentId: target['fragmentId'],
    },
    basisHash: value['basisHash'],
  };
}

export function parseAudioJobScope(value: unknown): AudioJobScope | null {
  if (record(value) && record(value['target']) && value['target']['kind'] === 'project-text')
    return parseProjectAudioTextJobScope(value, value['target']);
  if (record(value) && record(value['target']) && value['target']['kind'] === 'project-clip')
    return parseProjectAudioJobScope(value, value['target']);
  if (
    record(value) &&
    ['projectId', 'projectRevision', 'projectUpdatedAt'].some((key) => key in value)
  )
    return null;
  if (record(value) && record(value['target']) && value['target']['kind'] === 'text') {
    const target = value['target'];
    if (
      !identifier(value['workspaceId']) ||
      !revision(value['workspaceRevision']) ||
      Object.keys(target).length !== 2 ||
      !identifier(target['fragmentId']) ||
      !revision(value['textRevision']) ||
      !revision(value['timingRevision']) ||
      typeof value['start'] !== 'number' ||
      !Number.isFinite(value['start']) ||
      value['start'] < 0 ||
      typeof value['end'] !== 'number' ||
      !Number.isFinite(value['end']) ||
      value['end'] <= value['start'] ||
      value['end'] > 86_400 ||
      (value['timeDomain'] !== 'source' && value['timeDomain'] !== 'result') ||
      ['assetId', 'nativeStart', 'nativeEnd', 'clipId'].some((key) => key in value)
    )
      return null;
    return {
      workspaceId: value['workspaceId'],
      workspaceRevision: value['workspaceRevision'],
      target: { kind: 'text', fragmentId: target['fragmentId'] },
      textRevision: value['textRevision'],
      timingRevision: value['timingRevision'],
      start: value['start'],
      end: value['end'],
      timeDomain: value['timeDomain'],
    };
  }
  if (
    !record(value) ||
    !identifier(value['workspaceId']) ||
    'clipId' in value ||
    !identifier(value['assetId']) ||
    !revision(value['workspaceRevision']) ||
    typeof value['nativeStart'] !== 'number' ||
    !Number.isFinite(value['nativeStart']) ||
    value['nativeStart'] < 0 ||
    typeof value['nativeEnd'] !== 'number' ||
    !Number.isFinite(value['nativeEnd']) ||
    value['nativeEnd'] <= value['nativeStart'] ||
    !validAudioInputDuration(value['nativeEnd'] - value['nativeStart'])
  )
    return null;
  const target = parseReviewSpeechTarget(value['target']);
  if (!target) return null;
  return {
    workspaceId: value['workspaceId'],
    workspaceRevision: value['workspaceRevision'],
    target,
    assetId: value['assetId'],
    nativeStart: value['nativeStart'],
    nativeEnd: value['nativeEnd'],
  };
}
export function parseAudioJobClientMessage(value: unknown): AudioJobClientMessage | null {
  if (!record(value) || !identifier(value['requestId'])) return null;
  const requestId = value['requestId'];
  if (value['type'] === 'cancel') return { type: 'cancel', requestId };
  if (value['type'] === 'keepalive') return { type: 'keepalive', requestId };
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
  const approvedProviderId = value['approvedProviderId'];
  if (
    (approvedProviderId !== undefined && !identifier(approvedProviderId)) ||
    ((!isAudioSourceJobScope(scope) || isProjectAudioJobScope(scope)) &&
      !identifier(approvedProviderId))
  )
    return null;
  const base = {
    type: 'start' as const,
    requestId,
    modelId: value['modelId'],
    scope,
    ...(typeof approvedProviderId === 'string' ? { approvedProviderId } : {}),
  };
  if (value['operation'] === 'transcription') {
    const recognition =
      value['recognition'] === undefined
        ? undefined
        : parseAudioRecognitionOptions(value['recognition']);
    if (
      !isAudioSourceJobScope(scope) ||
      recognition === null ||
      (recognition && !identifier(approvedProviderId))
    )
      return null;
    return { ...base, operation: 'transcription', scope, ...(recognition ? { recognition } : {}) };
  }
  if ('recognition' in value) return null;
  if (isProjectAudioSourceJobScope(scope)) return null;
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
  if (
    !isAudioSourceJobScope(scope) &&
    (scope.target.fragmentId !== value['phraseId'] ||
      (!isProjectAudioTextJobScope(scope) && scope.textRevision !== value['textRevision']))
  )
    return null;
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
  if (isProjectAudioTextJobScope(left) || isProjectAudioTextJobScope(right))
    return (
      isProjectAudioTextJobScope(left) &&
      isProjectAudioTextJobScope(right) &&
      left.projectId === right.projectId &&
      left.projectRevision === right.projectRevision &&
      left.projectUpdatedAt === right.projectUpdatedAt &&
      left.target.documentId === right.target.documentId &&
      left.target.fragmentId === right.target.fragmentId &&
      left.basisHash === right.basisHash
    );
  if (isProjectAudioSourceJobScope(left) || isProjectAudioSourceJobScope(right))
    return (
      isProjectAudioSourceJobScope(left) &&
      isProjectAudioSourceJobScope(right) &&
      left.projectId === right.projectId &&
      left.projectRevision === right.projectRevision &&
      left.projectUpdatedAt === right.projectUpdatedAt &&
      left.target.clipId === right.target.clipId &&
      left.assetId === right.assetId &&
      left.nativeStart === right.nativeStart &&
      left.nativeEnd === right.nativeEnd
    );
  if (left.workspaceId !== right.workspaceId || left.workspaceRevision !== right.workspaceRevision)
    return false;
  if (!isAudioSourceJobScope(left))
    return (
      !isAudioSourceJobScope(right) &&
      left.target.fragmentId === right.target.fragmentId &&
      left.textRevision === right.textRevision &&
      left.timingRevision === right.timingRevision &&
      left.start === right.start &&
      left.end === right.end &&
      left.timeDomain === right.timeDomain
    );
  return (
    isAudioSourceJobScope(right) &&
    sameReviewSpeechTarget(left.target, right.target) &&
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
  const header = readAudioTranscriptHeader(value);
  if (!header) return null;
  const { result, value: fields } = header;
  for (const key of ['segments', 'words'] as const) {
    const entries = fields[key];
    if (entries === undefined) continue;
    if (!Array.isArray(entries) || entries.length > 10000) return null;
    const parsed: AudioTranscriptTiming[] = [];
    for (const item of entries) {
      if (
        !record(item) ||
        typeof item['text'] !== 'string' ||
        item['text'].length > 100000 ||
        (item['originalText'] !== undefined &&
          (key === 'words' ||
            typeof item['originalText'] !== 'string' ||
            item['originalText'].length > 16000)) ||
        typeof item['start'] !== 'number' ||
        !Number.isFinite(item['start']) ||
        item['start'] < 0 ||
        typeof item['end'] !== 'number' ||
        !Number.isFinite(item['end']) ||
        (key === 'words' ? item['end'] < item['start'] : item['end'] <= item['start']) ||
        item['end'] > AUDIO_INPUT_MAX_SECONDS ||
        (parsed.length > 0 &&
          item['start'] < (key === 'words' ? parsed.at(-1)!.end : parsed.at(-1)!.start))
      )
        return null;
      parsed.push({
        text: item['text'],
        start: item['start'],
        end: item['end'],
        ...(typeof item['originalText'] === 'string' ? { originalText: item['originalText'] } : {}),
      });
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
    const code = parseAudioJobFailureCode(value['code']);
    return code ? { type: 'failure', requestId, code } : null;
  }
  return null;
}

export function readAudioTranscriptHeader(
  value: unknown
): { value: Record<string, unknown>; result: AudioTranscriptResult } | null {
  if (!record(value) || typeof value['text'] !== 'string' || value['text'].length > 100000)
    return null;
  return { value, result: { text: value['text'] } };
}
