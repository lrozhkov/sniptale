import { isEffectRuntimeImmutableId } from '../../contracts/effect-runtime/immutable-refs';
import {
  createEffectRuntimeFailure,
  getEffectRuntimeIdentity,
  hasExactKeys,
  isRecord,
  parseEffectRuntimeIdentity,
} from '../../contracts/effect-runtime/identity';
import { EFFECT_RUNTIME_PROTOCOL_VERSION } from '../../contracts/effect-runtime/types';
import {
  createEffectRuntimeDocumentCache,
  type EffectRuntimeDocumentCache,
} from './cache/documents';
import {
  createEffectRuntimeAssetSelectionCache,
  type EffectRuntimeAssetSelectionCache,
} from './cache/asset-selections';
import { EFFECT_RUNTIME_MESSAGE_KEYS } from './request-policy';
import {
  resolveEffectRuntimeRequestPayload,
  type EffectRuntimeRequestParseResult,
} from './request-resolution';

export async function parseEffectRuntimeRenderRequest(
  value: unknown,
  documentCache: EffectRuntimeDocumentCache = createEffectRuntimeDocumentCache(),
  assetSelectionCache: EffectRuntimeAssetSelectionCache = createEffectRuntimeAssetSelectionCache()
): Promise<EffectRuntimeRequestParseResult> {
  const identity = getEffectRuntimeIdentity(value);
  try {
    if (!isRecord(value) || !hasExactKeys(value, EFFECT_RUNTIME_MESSAGE_KEYS)) {
      return reject(value, 'malformed');
    }
    const parsedIdentity = parseEffectRuntimeIdentity(value);
    if (!parsedIdentity || !hasValidRenderRequestHeader(value)) {
      return reject(value, 'malformed');
    }
    const documentRef = parseDocumentReference(value['documentRef']);
    const assetSelectionRef = parseAssetSelectionReference(value['assetSelectionRef']);
    if (!documentRef || !assetSelectionRef) return reject(parsedIdentity, 'malformed');
    if (value['snapshotId'] !== `effect:${documentRef.id}`) {
      return reject(parsedIdentity, 'inputRejected');
    }
    return resolveEffectRuntimeRequestPayload({
      assetSelectionCache,
      assetSelectionRef,
      documentCache,
      documentRef,
      identity: parsedIdentity,
      value,
    });
  } catch {
    return { failure: createEffectRuntimeFailure(identity, 'inputRejected'), ok: false };
  }
}

function hasValidRenderRequestHeader(value: Record<string, unknown>): boolean {
  return (
    value['kind'] === 'renderFrame' && value['protocolVersion'] === EFFECT_RUNTIME_PROTOCOL_VERSION
  );
}

function parseDocumentReference(value: unknown): { id: string; source?: string } | null {
  if (
    !isRecord(value) ||
    (!hasExactKeys(value, ['id']) && !hasExactKeys(value, ['id', 'source'])) ||
    !isEffectRuntimeImmutableId(value['id']) ||
    ('source' in value && typeof value['source'] !== 'string')
  ) {
    return null;
  }
  if (!('source' in value)) return { id: value['id'] };
  const source = value['source'];
  return typeof source === 'string' ? { id: value['id'], source } : null;
}

function parseAssetSelectionReference(value: unknown): { assets?: unknown; id: string } | null {
  if (
    !isRecord(value) ||
    (!hasExactKeys(value, ['id']) && !hasExactKeys(value, ['assets', 'id'])) ||
    !isEffectRuntimeImmutableId(value['id'])
  ) {
    return null;
  }
  return { id: value['id'], ...('assets' in value ? { assets: value['assets'] } : {}) };
}

function reject(
  value: unknown,
  code: 'inputRejected' | 'malformed'
): EffectRuntimeRequestParseResult {
  return { failure: createEffectRuntimeFailure(value, code), ok: false };
}
