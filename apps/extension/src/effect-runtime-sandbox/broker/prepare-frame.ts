import {
  validateEffectV1Document,
  type EffectV1Asset,
} from '@sniptale/runtime-contracts/effect-v1';

import {
  decodeEffectRaster,
  EffectMediaDecodeError,
} from '../../features/video/composition/effect-runtime/media/decode';
import type { EffectRasterMimeType } from '../../features/video/composition/effect-runtime/media/raster-header';
import { closeEffectRuntimeBitmaps } from '../../contracts/effect-runtime/bitmap-lifetime';
import {
  EFFECT_RUNTIME_WORKER_REQUEST,
  type EffectRuntimeErrorCode,
  type EffectRuntimeRenderRequest,
  type EffectRuntimeWorkerAsset,
  type EffectRuntimeWorkerMessage,
} from '../../contracts/effect-runtime/types';
import { serializeEffectSvgVector } from './svg/vector-source';
import {
  assertEffectDecodedRaster,
  EFFECT_RUNTIME_RESOURCE_LIMITS,
} from '../../features/video/composition/effect-runtime/runtime/resource-limits';

export class EffectRuntimePreparationError extends Error {
  readonly code: Exclude<EffectRuntimeErrorCode, 'cacheMiss'>;

  constructor(code: Exclude<EffectRuntimeErrorCode, 'cacheMiss'>) {
    super(`Effect runtime preparation failed: ${code}`);
    this.name = 'EffectRuntimePreparationError';
    this.code = code;
  }
}

export async function prepareEffectRuntimeWorkerRequest(
  request: EffectRuntimeRenderRequest
): Promise<EffectRuntimeWorkerMessage> {
  const assets: Record<string, EffectRuntimeWorkerAsset> = {};
  try {
    await prepareEffectRuntimeWorkerAssets(request, assets);
    return createEffectRuntimeWorkerMessage(request, assets);
  } catch (error) {
    closeEffectRuntimeBitmaps(assets);
    throw normalizeEffectRuntimePreparationError(error);
  }
}

async function prepareEffectRuntimeWorkerAssets(
  request: EffectRuntimeRenderRequest,
  assets: Record<string, EffectRuntimeWorkerAsset>
): Promise<void> {
  let decodedRasterBytes = 0;
  let decodedRasterEntries = 0;
  for (const payload of request.assets) {
    const declaration = request.document.assets.find(({ id }) => id === payload.id);
    if (!declaration) throw new EffectRuntimePreparationError('inputRejected');
    const prepared = await prepareVisualAsset(payload, declaration);
    if (prepared.kind === 'image') {
      decodedRasterEntries += 1;
      decodedRasterBytes += assertEffectDecodedRaster(prepared.width, prepared.height);
      if (
        decodedRasterEntries > EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedRasterEntries ||
        decodedRasterBytes > EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedRasterBytes
      ) {
        prepared.bitmap.close();
        throw new EffectRuntimePreparationError('resourceLimit');
      }
    }
    assets[payload.id] = prepared;
  }
}

function createEffectRuntimeWorkerMessage(
  request: EffectRuntimeRenderRequest,
  assets: Record<string, EffectRuntimeWorkerAsset>
): EffectRuntimeWorkerMessage {
  return {
    assetSelectionRef: {
      id: request.assetSelectionId,
      ...(request.assetSelectionPayloadIncluded ? { assets } : {}),
    },
    controls: request.controls,
    documentRef: {
      id: request.documentId,
      ...(request.documentPayloadIncluded ? { document: createWorkerDocument(request) } : {}),
    },
    duration: request.duration,
    effectInstanceId: request.effectInstanceId,
    fps: request.fps,
    frameIndex: request.frameIndex,
    height: request.height,
    inputFrames: request.inputFrames,
    progress: request.progress,
    protocolVersion: request.protocolVersion,
    renderHeight: request.renderHeight,
    renderWidth: request.renderWidth,
    requestId: request.requestId,
    sequenceId: request.sequenceId,
    snapshotId: request.snapshotId,
    time: request.time,
    type: EFFECT_RUNTIME_WORKER_REQUEST,
    width: request.width,
  };
}

function normalizeEffectRuntimePreparationError(error: unknown): EffectRuntimePreparationError {
  if (error instanceof EffectRuntimePreparationError) return error;
  if (error instanceof EffectMediaDecodeError) {
    return new EffectRuntimePreparationError(
      error.code === 'mediaDecodeTimeout' ? 'timeout' : 'mediaDecodeFailed'
    );
  }
  return new EffectRuntimePreparationError('inputRejected');
}

async function prepareVisualAsset(
  payload: EffectRuntimeRenderRequest['assets'][number],
  declaration: EffectV1Asset
): Promise<EffectRuntimeWorkerAsset> {
  const bytes = new Uint8Array(payload.bytes);
  if (payload.kind === 'image') {
    const decoded = await decodeEffectRaster(bytes, payload.mimeType as EffectRasterMimeType);
    try {
      assertDeclaredDimensions(declaration, decoded.header.width, decoded.header.height);
      assertDeclaredDimensions(declaration, decoded.bitmap.width, decoded.bitmap.height);
      return {
        bitmap: decoded.bitmap,
        cacheKey: payload.sha256,
        height: decoded.bitmap.height,
        id: payload.id,
        kind: 'image',
        mimeType: payload.mimeType,
        width: decoded.bitmap.width,
      };
    } catch {
      decoded.bitmap.close();
      throw new EffectRuntimePreparationError('mediaDecodeFailed');
    }
  }
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new EffectRuntimePreparationError('inputRejected');
  }
  const svgVector = serializeEffectSvgVector(source, {
    ...(declaration.height === undefined ? {} : { height: declaration.height }),
    ...(declaration.width === undefined ? {} : { width: declaration.width }),
  });
  assertDeclaredDimensions(declaration, svgVector.width, svgVector.height);
  return {
    cacheKey: payload.sha256,
    height: svgVector.height,
    id: payload.id,
    kind: 'svg',
    mimeType: 'image/svg+xml',
    svgVector,
    width: svgVector.width,
  };
}

function createWorkerDocument(request: EffectRuntimeRenderRequest) {
  const document = {
    ...request.document,
    assets: request.document.assets.map((asset, index) => {
      const { dataUrl: _dataUrl, path: _path, svgText: _svgText, ...metadata } = asset;
      return { ...metadata, path: `runtime-assets/asset-${index}` };
    }),
  };
  const validation = validateEffectV1Document(document);
  if (!validation.ok || !validation.document) {
    throw new EffectRuntimePreparationError('inputRejected');
  }
  return validation.document;
}

function assertDeclaredDimensions(
  declaration: Pick<EffectV1Asset, 'height' | 'width'>,
  width: number,
  height: number
): void {
  if (
    (declaration.width !== undefined && declaration.width !== width) ||
    (declaration.height !== undefined && declaration.height !== height)
  ) {
    throw new EffectRuntimePreparationError('mediaDecodeFailed');
  }
}
