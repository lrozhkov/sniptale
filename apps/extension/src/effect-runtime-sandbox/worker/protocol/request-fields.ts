import type { AnimationTemplate } from '@sniptale/runtime-contracts/animation-template';
import {
  parseRuntimeAnimationDocument,
  parseRuntimeAnimationFrame,
} from '../../../contracts/effect-runtime/animation';
import { isEffectRuntimeImmutableId } from '../../../contracts/effect-runtime/immutable-refs';
import {
  hasExactKeys,
  isRecord,
  parseEffectRuntimeIdentity,
} from '../../../contracts/effect-runtime/identity';
import {
  EFFECT_RUNTIME_PROTOCOL_VERSION,
  EFFECT_RUNTIME_WORKER_REQUEST,
  type EffectRuntimeFrameIdentity,
  type EffectRuntimeWorkerAsset,
} from '../../../contracts/effect-runtime/types';
import { assertEffectDecodedRaster } from '../resource-policy';
import { EFFECT_RUNTIME_WORKER_REQUEST_KEYS } from './request-policy';

export interface WorkerRequestEnvelope {
  assetSelectionRef: { assets?: unknown; id: string };
  documentRef: { document?: AnimationTemplate; id: string };
  identity: EffectRuntimeFrameIdentity;
  value: Record<string, unknown>;
}
export type WorkerRequestFields = NonNullable<ReturnType<typeof parseRuntimeAnimationFrame>> & {
  renderDimensions: { width: number; height: number };
  suppliedAssets: Record<string, EffectRuntimeWorkerAsset> | undefined;
};
function documentRef(value: unknown): WorkerRequestEnvelope['documentRef'] | null {
  if (
    !isRecord(value) ||
    (!hasExactKeys(value, ['id']) && !hasExactKeys(value, ['id', 'document'])) ||
    !isEffectRuntimeImmutableId(value['id'])
  )
    return null;
  if (!('document' in value)) return { id: value['id'] };
  const document = parseRuntimeAnimationDocument(value['document']);
  return document ? { id: value['id'], document } : null;
}
function assetRef(value: unknown): WorkerRequestEnvelope['assetSelectionRef'] | null {
  if (
    !isRecord(value) ||
    (!hasExactKeys(value, ['id']) && !hasExactKeys(value, ['id', 'assets'])) ||
    !isEffectRuntimeImmutableId(value['id'])
  )
    return null;
  return { id: value['id'], ...('assets' in value ? { assets: value['assets'] } : {}) };
}
export function parseWorkerRequestEnvelope(value: unknown): WorkerRequestEnvelope | null {
  if (!isRecord(value) || !hasExactKeys(value, EFFECT_RUNTIME_WORKER_REQUEST_KEYS)) return null;
  if (!isRecord(value['inputFrames']) || !hasExactKeys(value['inputFrames'], [])) return null;
  const identity = parseEffectRuntimeIdentity(value),
    document = documentRef(value['documentRef']),
    assets = assetRef(value['assetSelectionRef']);
  if (
    !identity ||
    !document ||
    !assets ||
    value['type'] !== EFFECT_RUNTIME_WORKER_REQUEST ||
    value['protocolVersion'] !== EFFECT_RUNTIME_PROTOCOL_VERSION ||
    value['snapshotId'] !== `effect:${document.id}`
  )
    return null;
  return { identity, documentRef: document, assetSelectionRef: assets, value };
}
export function parseWorkerRequestFields(
  envelope: WorkerRequestEnvelope,
  document: AnimationTemplate
): WorkerRequestFields | null {
  const fields = parseRuntimeAnimationFrame(envelope.value, document);
  if (!fields) return null;
  const width = envelope.value['renderWidth'],
    height = envelope.value['renderHeight'];
  if (typeof width !== 'number' || typeof height !== 'number') return null;
  try {
    assertEffectDecodedRaster(width, height);
  } catch {
    return null;
  }
  const supplied = envelope.assetSelectionRef.assets;
  if (supplied !== undefined && (!isRecord(supplied) || !hasExactKeys(supplied, []))) return null;
  return {
    ...fields,
    renderDimensions: { width, height },
    suppliedAssets: supplied === undefined ? undefined : {},
  };
}
