import type { AnimationArtifactImportResult } from '../../lottie-profile';
import { parseAnimationImportResult } from './result';
import { EFFECT_BUNDLE_LIMITS } from '../../limits';
import { hasExactKeys, isBoundedString, isRecord } from '../../validation';

function isRequestId(value: unknown): value is string {
  return isBoundedString(value, 128) && /^[A-Za-z0-9._:-]+$/.test(value);
}

const ANIMATION_REQUEST_TYPE = 'sniptale:animation:import-request';
const ANIMATION_RESPONSE_TYPE = 'sniptale:animation:import-response';
const ANIMATION_TOKEN = 'sniptale:animation:import-v1';
export function createAnimationImportWorkerRequest(requestId: string, bytes: Uint8Array) {
  return { type: ANIMATION_REQUEST_TYPE, token: ANIMATION_TOKEN, requestId, bytes };
}
export function parseAnimationImportWorkerRequest(
  value: unknown
): { requestId: string; bytes: Uint8Array } | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['type', 'token', 'requestId', 'bytes']) ||
    value['type'] !== ANIMATION_REQUEST_TYPE ||
    value['token'] !== ANIMATION_TOKEN ||
    !isRequestId(value['requestId']) ||
    !(value['bytes'] instanceof Uint8Array) ||
    !value['bytes'].byteLength ||
    value['bytes'].byteLength > EFFECT_BUNDLE_LIMITS.maxArchiveBytes
  )
    return null;
  return { requestId: value['requestId'], bytes: value['bytes'] };
}
export function createAnimationImportWorkerResponse(
  requestId: string,
  result: AnimationArtifactImportResult
) {
  return {
    type: ANIMATION_RESPONSE_TYPE,
    token: ANIMATION_TOKEN,
    requestId,
    result: result.ok
      ? {
          ok: true,
          kind: result.kind,
          archiveSha256: result.archiveSha256,
          ...(result.package ? { package: result.package } : {}),
          documents: result.documents.map((document) => ({
            source: document.source,
            sha256: document.sha256,
          })),
        }
      : result,
  };
}
export async function parseAnimationImportWorkerResponse(
  value: unknown,
  expectedRequestId: string,
  expectedArchiveSha256: string
): Promise<AnimationArtifactImportResult | null> {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['type', 'token', 'requestId', 'result']) ||
    value['type'] !== ANIMATION_RESPONSE_TYPE ||
    value['token'] !== ANIMATION_TOKEN ||
    value['requestId'] !== expectedRequestId
  )
    return null;
  return parseAnimationImportResult(value['result'], expectedArchiveSha256);
}
