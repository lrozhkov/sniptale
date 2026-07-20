import type { EffectV1Document } from '@sniptale/runtime-contracts/effect-v1';

import { createEffectRuntimeAssetSelectionId } from '../../contracts/effect-runtime/immutable-refs';
import {
  createEffectRuntimeFailure,
  getEffectRuntimeIdentity,
  type parseEffectRuntimeIdentity,
} from '../../contracts/effect-runtime/identity';
import {
  EFFECT_RUNTIME_PROTOCOL_VERSION,
  type EffectRuntimeCacheMissFailure,
  type EffectRuntimeFrameFailure,
  type EffectRuntimeFrameInputs,
  type EffectRuntimeRenderRequest,
} from '../../contracts/effect-runtime/types';
import type { EffectRuntimeAssetSelectionCache } from './cache/asset-selections';
import type { EffectRuntimeDocumentCache } from './cache/documents';
import { parseVisualAssets } from './request-assets';
import { parseAndVerifyEffectDocument } from './request-document';
import {
  parseControls,
  parseFrameDimensions,
  parseInputFrames,
  parseRenderDimensions,
  parseTiming,
} from './request-fields';

export type EffectRuntimeRequestParseResult =
  | { ok: true; request: EffectRuntimeRenderRequest }
  | { failure: EffectRuntimeCacheMissFailure | EffectRuntimeFrameFailure; ok: false };

interface ResolveEffectRuntimeRequestPayloadParams {
  assetSelectionCache: EffectRuntimeAssetSelectionCache;
  assetSelectionRef: { assets?: unknown; id: string };
  documentCache: EffectRuntimeDocumentCache;
  documentRef: { id: string; source?: string };
  identity: ReturnType<typeof parseEffectRuntimeIdentity> & {};
  value: Record<string, unknown>;
}

function reject(value: unknown): EffectRuntimeRequestParseResult {
  return { failure: createEffectRuntimeFailure(value, 'inputRejected'), ok: false };
}

function createCacheMiss(
  value: unknown,
  missingRef: EffectRuntimeCacheMissFailure['missingRef']
): EffectRuntimeCacheMissFailure {
  return { ...getEffectRuntimeIdentity(value), code: 'cacheMiss', kind: 'error', missingRef };
}

async function resolveDocument(
  ref: { id: string; source?: string },
  cache: EffectRuntimeDocumentCache
): Promise<{ document: EffectV1Document } | 'cacheMiss' | null> {
  if (ref.source === undefined) {
    const cached = cache.get(ref.id);
    return cached ? { document: cached.document } : 'cacheMiss';
  }
  const document = await parseAndVerifyEffectDocument(ref.source, ref.id);
  if (!document || !cache.set({ document, id: ref.id, source: ref.source })) return null;
  return { document };
}

async function resolveAssetSelection(params: {
  cache: EffectRuntimeAssetSelectionCache;
  document: EffectV1Document;
  identity: ResolveEffectRuntimeRequestPayloadParams['identity'];
  ref: { assets?: unknown; id: string };
}): Promise<
  | { assets: EffectRuntimeRenderRequest['assets']; payloadIncluded: boolean }
  | EffectRuntimeRequestParseResult
> {
  const expectedId = await createEffectRuntimeAssetSelectionId(
    params.document.assets.filter(
      (asset): asset is typeof asset & { sha256: string } =>
        asset.kind !== 'audio' && typeof asset.sha256 === 'string'
    )
  );
  if (params.ref.id !== expectedId) return reject(params.identity);
  if (params.ref.assets === undefined && !params.cache.has(params.ref.id)) {
    return { failure: createCacheMiss(params.identity, 'assetSelection'), ok: false };
  }
  const assets = params.ref.assets
    ? await parseVisualAssets(params.ref.assets, params.document)
    : [];
  if (!assets) return reject(params.identity);
  if (params.ref.assets !== undefined) params.cache.set(params.ref.id);
  return { assets, payloadIncluded: params.ref.assets !== undefined };
}

function createAcceptedRequest(args: {
  assetSelectionId: string;
  assetSelectionPayloadIncluded: boolean;
  assets: EffectRuntimeRenderRequest['assets'];
  controls: EffectRuntimeRenderRequest['controls'];
  dimensions: { height: number; width: number };
  document: EffectV1Document;
  documentId: string;
  documentPayloadIncluded: boolean;
  identity: ResolveEffectRuntimeRequestPayloadParams['identity'];
  inputFrames: EffectRuntimeFrameInputs;
  renderDimensions: { height: number; width: number };
  timing: Pick<EffectRuntimeRenderRequest, 'duration' | 'fps' | 'frameIndex' | 'progress' | 'time'>;
}): EffectRuntimeRequestParseResult {
  return {
    ok: true,
    request: {
      ...args.identity,
      assets: args.assets,
      assetSelectionId: args.assetSelectionId,
      assetSelectionPayloadIncluded: args.assetSelectionPayloadIncluded,
      controls: args.controls,
      document: args.document,
      documentId: args.documentId,
      documentPayloadIncluded: args.documentPayloadIncluded,
      height: args.dimensions.height,
      inputFrames: args.inputFrames,
      kind: 'renderFrame',
      protocolVersion: EFFECT_RUNTIME_PROTOCOL_VERSION,
      renderHeight: args.renderDimensions.height,
      renderWidth: args.renderDimensions.width,
      width: args.dimensions.width,
      ...args.timing,
    },
  };
}

function parseResolvedRequestFields(value: Record<string, unknown>, document: EffectV1Document) {
  const dimensions = parseFrameDimensions(value['width'], value['height']);
  const renderDimensions = parseRenderDimensions(
    value['renderWidth'],
    value['renderHeight'],
    dimensions
  );
  const timing = parseTiming(value, document.duration);
  const controls = parseControls(value['controls'], document);
  const inputFrames = parseInputFrames(value['inputFrames'], document, renderDimensions);
  return dimensions && renderDimensions && timing && controls && inputFrames
    ? { controls, dimensions, inputFrames, renderDimensions, timing }
    : null;
}

export async function resolveEffectRuntimeRequestPayload(
  params: ResolveEffectRuntimeRequestPayloadParams
): Promise<EffectRuntimeRequestParseResult> {
  const resolved = await resolveDocument(params.documentRef, params.documentCache);
  if (resolved === 'cacheMiss') {
    return { failure: createCacheMiss(params.identity, 'document'), ok: false };
  }
  if (!resolved) return reject(params.identity);
  const selection = await resolveAssetSelection({
    cache: params.assetSelectionCache,
    document: resolved.document,
    identity: params.identity,
    ref: params.assetSelectionRef,
  });
  if ('ok' in selection) return selection;
  const fields = parseResolvedRequestFields(params.value, resolved.document);
  if (!fields) return reject(params.identity);
  return createAcceptedRequest({
    assetSelectionId: params.assetSelectionRef.id,
    assetSelectionPayloadIncluded: selection.payloadIncluded,
    assets: selection.assets,
    document: resolved.document,
    documentId: params.documentRef.id,
    documentPayloadIncluded: params.documentRef.source !== undefined,
    identity: params.identity,
    ...fields,
  });
}
