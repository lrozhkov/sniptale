import type { EffectArtifactKind, ImportEffectArtifactResult } from '../artifact';
import { EFFECT_BUNDLE_LIMITS } from '../../limits';
import { hasExactKeys, isBoundedString, isRecord } from '../../validation';
import { parseEffectImportResult } from './result';

const REQUEST_TYPE = 'sniptale:effect-bundle:import-request';
const RESPONSE_TYPE = 'sniptale:effect-bundle:import-response';
const PROTOCOL_TOKEN = 'sniptale:effect-bundle:import-v1';

interface EffectImportWorkerRequest {
  bytes: Uint8Array;
  kind: EffectArtifactKind;
  requestId: string;
  token: typeof PROTOCOL_TOKEN;
  type: typeof REQUEST_TYPE;
}

interface EffectImportWorkerResponse {
  requestId: string;
  result: ImportEffectArtifactResult;
  token: typeof PROTOCOL_TOKEN;
  type: typeof RESPONSE_TYPE;
}

export function createEffectImportWorkerRequest(
  requestId: string,
  kind: EffectArtifactKind,
  bytes: Uint8Array
): EffectImportWorkerRequest {
  return { bytes, kind, requestId, token: PROTOCOL_TOKEN, type: REQUEST_TYPE };
}

export function parseEffectImportWorkerRequest(value: unknown): EffectImportWorkerRequest | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['bytes', 'kind', 'requestId', 'token', 'type']) ||
    value['type'] !== REQUEST_TYPE ||
    value['token'] !== PROTOCOL_TOKEN ||
    !isRequestId(value['requestId']) ||
    (value['kind'] !== 'bundle-zip' && value['kind'] !== 'raw-json') ||
    !(value['bytes'] instanceof Uint8Array)
  ) {
    return null;
  }
  const maximum =
    value['kind'] === 'bundle-zip'
      ? EFFECT_BUNDLE_LIMITS.maxArchiveBytes
      : EFFECT_BUNDLE_LIMITS.maxJsonBytes;
  return value['bytes'].byteLength > 0 && value['bytes'].byteLength <= maximum
    ? {
        bytes: value['bytes'],
        kind: value['kind'],
        requestId: value['requestId'],
        token: PROTOCOL_TOKEN,
        type: REQUEST_TYPE,
      }
    : null;
}

export function createEffectImportWorkerResponse(
  requestId: string,
  result: ImportEffectArtifactResult
): EffectImportWorkerResponse {
  return { requestId, result, token: PROTOCOL_TOKEN, type: RESPONSE_TYPE };
}

export function parseEffectImportWorkerResponse(
  value: unknown,
  expectedRequestId: string
): ImportEffectArtifactResult | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['requestId', 'result', 'token', 'type']) ||
    value['type'] !== RESPONSE_TYPE ||
    value['token'] !== PROTOCOL_TOKEN ||
    value['requestId'] !== expectedRequestId
  ) {
    return null;
  }
  return parseEffectImportResult(value['result']);
}

export function collectEffectImportResultTransferables(
  result: ImportEffectArtifactResult
): Transferable[] {
  if (!result.ok) return [];
  const documents =
    result.artifact.kind === 'bundle-zip'
      ? result.artifact.bundle.documents
      : [result.artifact.document.document];
  const buffers = new Set<ArrayBuffer>();
  for (const document of documents) {
    for (const asset of document.assets) {
      if (asset.bytes.buffer instanceof ArrayBuffer) buffers.add(asset.bytes.buffer);
    }
  }
  return [...buffers];
}

function isRequestId(value: unknown): value is string {
  return isBoundedString(value, 128) && /^[A-Za-z0-9._:-]+$/.test(value);
}
