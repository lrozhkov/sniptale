import type { EffectV1Document } from '@sniptale/runtime-contracts/effect-v1';

import {
  EFFECT_RUNTIME_PROTOCOL_VERSION,
  EFFECT_RUNTIME_WORKER_REQUEST,
  type EffectRuntimeWorkerAsset,
  type EffectRuntimeWorkerRequest,
} from '../../../contracts/effect-runtime/types';
import {
  parseWorkerRequestEnvelope,
  parseWorkerRequestFields,
  type WorkerRequestEnvelope,
  type WorkerRequestFields,
} from './request-fields';

interface EffectRuntimeWorkerImmutableCache {
  getAssets(id: string): Record<string, EffectRuntimeWorkerAsset> | null;
  getDocument(id: string): EffectV1Document | null;
  setAssets(id: string, assets: Record<string, EffectRuntimeWorkerAsset>): boolean;
  setDocument(id: string, document: EffectV1Document): void;
}

type EffectRuntimeWorkerRequestResolution =
  | { code: 'cacheMiss'; missingRef: 'assetSelection' | 'document'; ok: false }
  | { code: 'malformed' | 'resourceLimit'; ok: false }
  | { ok: true; request: EffectRuntimeWorkerRequest };

function createResolvedWorkerRequest(params: {
  assets: Record<string, EffectRuntimeWorkerAsset>;
  envelope: WorkerRequestEnvelope;
  fields: WorkerRequestFields;
  document: EffectV1Document;
}): EffectRuntimeWorkerRequest {
  const { assets, document, envelope, fields } = params;
  return {
    ...envelope.identity,
    assets,
    assetSelectionId: envelope.assetSelectionRef.id,
    controls: fields.controls,
    document,
    documentId: envelope.documentRef.id,
    duration: fields.timing.duration,
    fps: fields.timing.fps,
    frameIndex: fields.timing.frameIndex,
    height: fields.dimensions.height,
    inputFrames: fields.inputs,
    progress: fields.timing.progress,
    protocolVersion: EFFECT_RUNTIME_PROTOCOL_VERSION,
    renderHeight: fields.renderDimensions.height,
    renderWidth: fields.renderDimensions.width,
    time: fields.timing.time,
    type: EFFECT_RUNTIME_WORKER_REQUEST,
    width: fields.dimensions.width,
  };
}

export function resolveEffectRuntimeWorkerRequest(
  value: unknown,
  cache: EffectRuntimeWorkerImmutableCache
): EffectRuntimeWorkerRequestResolution {
  const envelope = parseWorkerRequestEnvelope(value);
  if (!envelope) return { code: 'malformed', ok: false };
  const document = envelope.documentRef.document ?? cache.getDocument(envelope.documentRef.id);
  if (!document) return { code: 'cacheMiss', missingRef: 'document', ok: false };
  const fields = parseWorkerRequestFields(envelope, document);
  if (!fields) return { code: 'malformed', ok: false };
  const assets = fields.suppliedAssets ?? cache.getAssets(envelope.assetSelectionRef.id);
  if (!assets && envelope.assetSelectionRef.assets === undefined) {
    return { code: 'cacheMiss', missingRef: 'assetSelection', ok: false };
  }
  if (!assets) return { code: 'malformed', ok: false };
  if (envelope.documentRef.document) {
    cache.setDocument(envelope.documentRef.id, envelope.documentRef.document);
  }
  if (
    fields.suppliedAssets &&
    !cache.setAssets(envelope.assetSelectionRef.id, fields.suppliedAssets)
  ) {
    return { code: 'resourceLimit', ok: false };
  }
  return {
    ok: true,
    request: createResolvedWorkerRequest({ assets, document, envelope, fields }),
  };
}

function createOneShotCache(): EffectRuntimeWorkerImmutableCache {
  const assets = new Map<string, Record<string, EffectRuntimeWorkerAsset>>();
  const documents = new Map<string, EffectV1Document>();
  return {
    getAssets: (id) => assets.get(id) ?? null,
    getDocument: (id) => documents.get(id) ?? null,
    setAssets(id, value) {
      assets.set(id, value);
      return true;
    },
    setDocument: (id, document) => documents.set(id, document),
  };
}

export function parseEffectRuntimeWorkerRequest(
  value: unknown,
  cache: EffectRuntimeWorkerImmutableCache = createOneShotCache()
): EffectRuntimeWorkerRequest | null {
  const resolution = resolveEffectRuntimeWorkerRequest(value, cache);
  return resolution.ok ? resolution.request : null;
}
