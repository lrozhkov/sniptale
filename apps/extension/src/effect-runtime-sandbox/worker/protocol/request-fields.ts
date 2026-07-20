import {
  resolveEffectV1InputContract,
  validateEffectV1Document,
  type EffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';

import { isImageBitmap } from '../../../contracts/effect-runtime/bitmap-lifetime';
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
  type EffectRuntimeFrameInputs,
  type EffectRuntimeWorkerAsset,
  type EffectRuntimeWorkerRequest,
} from '../../../contracts/effect-runtime/types';
import { assertEffectDecodedRaster } from '../resource-policy';
import { parseWorkerAssets } from './request-assets';
import {
  EFFECT_RUNTIME_WORKER_FRAME_KEYS,
  EFFECT_RUNTIME_WORKER_REQUEST_KEYS,
} from './request-policy';

export interface WorkerRequestEnvelope {
  assetSelectionRef: { assets?: unknown; id: string };
  documentRef: { document?: EffectV1Document; id: string };
  identity: EffectRuntimeFrameIdentity;
  value: Record<string, unknown>;
}

export interface WorkerRequestFields {
  controls: Record<string, number | string>;
  dimensions: { height: number; width: number };
  inputs: EffectRuntimeFrameInputs;
  renderDimensions: { height: number; width: number };
  suppliedAssets: Record<string, EffectRuntimeWorkerAsset> | undefined;
  timing: Pick<EffectRuntimeWorkerRequest, 'duration' | 'fps' | 'frameIndex' | 'progress' | 'time'>;
}

function parseDocumentRef(value: unknown): WorkerRequestEnvelope['documentRef'] | null {
  if (
    !isRecord(value) ||
    (!hasExactKeys(value, ['id']) && !hasExactKeys(value, ['document', 'id'])) ||
    !isEffectRuntimeImmutableId(value['id'])
  ) {
    return null;
  }
  if (!('document' in value)) return { id: value['id'] };
  const validation = validateEffectV1Document(value['document']);
  return validation.ok && validation.document
    ? { document: validation.document, id: value['id'] }
    : null;
}

function parseAssetSelectionRef(value: unknown): WorkerRequestEnvelope['assetSelectionRef'] | null {
  if (
    !isRecord(value) ||
    (!hasExactKeys(value, ['id']) && !hasExactKeys(value, ['assets', 'id'])) ||
    !isEffectRuntimeImmutableId(value['id'])
  ) {
    return null;
  }
  return 'assets' in value ? { assets: value['assets'], id: value['id'] } : { id: value['id'] };
}

export function parseWorkerRequestEnvelope(value: unknown): WorkerRequestEnvelope | null {
  if (!isRecord(value) || !hasExactKeys(value, EFFECT_RUNTIME_WORKER_REQUEST_KEYS)) return null;
  const identity = parseEffectRuntimeIdentity(value);
  const documentRef = parseDocumentRef(value['documentRef']);
  const assetSelectionRef = parseAssetSelectionRef(value['assetSelectionRef']);
  if (
    !identity ||
    !documentRef ||
    !assetSelectionRef ||
    value['type'] !== EFFECT_RUNTIME_WORKER_REQUEST ||
    value['protocolVersion'] !== EFFECT_RUNTIME_PROTOCOL_VERSION ||
    value['snapshotId'] !== `effect:${documentRef.id}`
  ) {
    return null;
  }
  return { assetSelectionRef, documentRef, identity, value };
}

function parseDimensions(
  width: unknown,
  height: unknown
): { height: number; width: number } | null {
  try {
    assertEffectDecodedRaster(width, height);
    return { height: height as number, width: width as number };
  } catch {
    return null;
  }
}

function parseTiming(
  value: Record<string, unknown>,
  duration: number
): WorkerRequestFields['timing'] | null {
  const candidate = {
    duration: value['duration'],
    fps: value['fps'],
    frameIndex: value['frameIndex'],
    progress: value['progress'],
    time: value['time'],
  };
  const valid =
    candidate.duration === duration &&
    typeof candidate.fps === 'number' &&
    Number.isFinite(candidate.fps) &&
    candidate.fps > 0 &&
    candidate.fps <= 240 &&
    typeof candidate.frameIndex === 'number' &&
    Number.isSafeInteger(candidate.frameIndex) &&
    candidate.frameIndex >= 0 &&
    typeof candidate.time === 'number' &&
    Number.isFinite(candidate.time) &&
    candidate.time >= 0 &&
    candidate.time <= duration &&
    typeof candidate.progress === 'number' &&
    Number.isFinite(candidate.progress) &&
    candidate.progress >= 0 &&
    candidate.progress <= 1 &&
    Math.abs(candidate.progress - candidate.time / duration) <= 1e-7;
  return valid ? (candidate as WorkerRequestFields['timing']) : null;
}

function parseControls(
  value: unknown,
  document: EffectV1Document
): Record<string, number | string> | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      document.controls.map(({ id }) => id)
    )
  )
    return null;
  const controls: Record<string, number | string> = {};
  for (const definition of document.controls) {
    const candidate = value[definition.id];
    if (definition.kind === 'number') {
      if (
        typeof candidate !== 'number' ||
        !Number.isFinite(candidate) ||
        (definition.min !== undefined && candidate < definition.min) ||
        (definition.max !== undefined && candidate > definition.max)
      ) {
        return null;
      }
    } else if (typeof candidate !== 'string' || candidate.length > 4_096) {
      return null;
    }
    controls[definition.id] = candidate;
  }
  return controls;
}

function parseInputs(
  value: unknown,
  document: EffectV1Document,
  dimensions: { height: number; width: number } | null
): EffectRuntimeFrameInputs | null {
  if (!dimensions || !isRecord(value)) return null;
  const names = resolveEffectV1InputContract(document.kind).required;
  if (!hasExactKeys(value, names)) return null;
  const inputs: EffectRuntimeFrameInputs = {};
  for (const name of names) {
    const frame = value[name];
    if (
      !isRecord(frame) ||
      !hasExactKeys(frame, EFFECT_RUNTIME_WORKER_FRAME_KEYS) ||
      !isImageBitmap(frame['bitmap']) ||
      frame['width'] !== dimensions.width ||
      frame['height'] !== dimensions.height ||
      frame['bitmap'].width !== dimensions.width ||
      frame['bitmap'].height !== dimensions.height
    ) {
      return null;
    }
    inputs[name] = { bitmap: frame['bitmap'], ...dimensions };
  }
  const bitmaps = Object.values(inputs).map(({ bitmap }) => bitmap);
  return new Set(bitmaps).size === bitmaps.length ? inputs : null;
}

export function parseWorkerRequestFields(
  envelope: WorkerRequestEnvelope,
  document: EffectV1Document
): WorkerRequestFields | null {
  const { value } = envelope;
  const dimensions = parseDimensions(value['width'], value['height']);
  const renderDimensions = parseDimensions(value['renderWidth'], value['renderHeight']);
  const timing = parseTiming(value, document.duration);
  const controls = parseControls(value['controls'], document);
  const inputs = parseInputs(value['inputFrames'], document, renderDimensions);
  const suppliedAssets =
    envelope.assetSelectionRef.assets === undefined
      ? undefined
      : parseWorkerAssets(envelope.assetSelectionRef.assets, document);
  if (
    !dimensions ||
    !renderDimensions ||
    !timing ||
    !controls ||
    !inputs ||
    (envelope.assetSelectionRef.assets !== undefined && !suppliedAssets)
  ) {
    return null;
  }
  return {
    controls,
    dimensions,
    inputs,
    renderDimensions,
    suppliedAssets: suppliedAssets ?? undefined,
    timing,
  };
}
