import type {
  EffectV1Document,
  EffectV1RuntimeInputName,
} from '@sniptale/runtime-contracts/effect-v1';

import type { SerializedSvgVector } from './svg-vector';
import type { EffectRuntimeGpuResource, EffectRuntimeGpuPass } from './gpu-plan';

export const EFFECT_RUNTIME_PROTOCOL_VERSION = 5 as const;
export const EFFECT_RUNTIME_SANDBOX_CONNECTION_FRAGMENT_KEY = 'connectionNonce' as const;
export const EFFECT_RUNTIME_SANDBOX_CONNECT_MESSAGE = 'sniptale:effect-runtime:connect' as const;
export const EFFECT_RUNTIME_SANDBOX_READY_MESSAGE = 'sniptale:effect-runtime:ready' as const;
export const EFFECT_RUNTIME_SANDBOX_RENDER_MESSAGE = 'sniptale:effect-runtime:render' as const;
export const EFFECT_RUNTIME_WORKER_REQUEST = 'sniptale:effect-runtime:worker-request' as const;
export const EFFECT_RUNTIME_WORKER_RESPONSE = 'sniptale:effect-runtime:worker-response' as const;

export type EffectRuntimeErrorCode =
  | 'cacheMiss'
  | 'circuitOpen'
  | 'crashed'
  | 'inputRejected'
  | 'malformed'
  | 'mediaDecodeFailed'
  | 'outputRejected'
  | 'queueDepthExceeded'
  | 'resourceLimit'
  | 'stale'
  | 'timeout';

export interface EffectRuntimeFrameIdentity {
  effectInstanceId: string;
  requestId: string;
  sequenceId: number;
  snapshotId: string;
}

export interface EffectRuntimeVisualAssetPayload {
  byteLength: number;
  bytes: ArrayBuffer;
  id: string;
  kind: 'image' | 'svg';
  mimeType: string;
  sha256: string;
}

export interface EffectRuntimeFrameInput {
  bitmap: ImageBitmap;
  height: number;
  width: number;
}

export type EffectRuntimeFrameInputs = Partial<
  Record<EffectV1RuntimeInputName, EffectRuntimeFrameInput>
>;

export interface EffectRuntimeDocumentReference {
  id: string;
  source?: string;
}

export interface EffectRuntimeAssetSelectionReference {
  assets?: EffectRuntimeVisualAssetPayload[];
  id: string;
}

export interface EffectRuntimeImmutablePayloads {
  assets: EffectRuntimeVisualAssetPayload[];
  documentSource: string;
}

export interface EffectRuntimeImmutableAcknowledgement {
  assetSelectionId: string;
  documentId: string;
}

interface EffectRuntimeFrameRequestFields extends EffectRuntimeFrameIdentity {
  controls: Record<string, number | string>;
  duration: number;
  fps: number;
  frameIndex: number;
  height: number;
  inputFrames: EffectRuntimeFrameInputs;
  progress: number;
  renderHeight: number;
  renderWidth: number;
  time: number;
  width: number;
}

/** Parent-owned command. Immutable bytes stay lazy until a session needs them. */
export interface EffectRuntimeRenderCommand extends EffectRuntimeFrameRequestFields {
  assetSelectionRef: Pick<EffectRuntimeAssetSelectionReference, 'id'>;
  documentRef: Pick<EffectRuntimeDocumentReference, 'id'>;
  materializeImmutablePayloads(): Promise<EffectRuntimeImmutablePayloads>;
}

/** Exact protocol-v5 message crossing from the parent into the sandbox. */
export interface EffectRuntimeRenderMessage extends EffectRuntimeFrameRequestFields {
  assetSelectionRef: EffectRuntimeAssetSelectionReference;
  documentRef: EffectRuntimeDocumentReference;
  kind: 'renderFrame' | 'prepareGpuFrame';
  protocolVersion: typeof EFFECT_RUNTIME_PROTOCOL_VERSION;
}

/** Broker-resolved request after immutable references have been validated. */
export interface EffectRuntimeRenderRequest extends EffectRuntimeFrameRequestFields {
  assets: EffectRuntimeVisualAssetPayload[];
  assetSelectionId: string;
  assetSelectionPayloadIncluded: boolean;
  document: EffectV1Document;
  documentId: string;
  documentPayloadIncluded: boolean;
  kind: 'renderFrame' | 'prepareGpuFrame';
  protocolVersion: typeof EFFECT_RUNTIME_PROTOCOL_VERSION;
}

export interface EffectRuntimeWorkerImageAsset {
  bitmap: ImageBitmap;
  cacheKey: string;
  height: number;
  id: string;
  kind: 'image';
  mimeType: string;
  width: number;
}

export interface EffectRuntimeWorkerSvgAsset {
  cacheKey: string;
  height: number;
  id: string;
  kind: 'svg';
  mimeType: 'image/svg+xml';
  svgVector: SerializedSvgVector;
  width: number;
}

export type EffectRuntimeWorkerAsset = EffectRuntimeWorkerImageAsset | EffectRuntimeWorkerSvgAsset;

export interface EffectRuntimeWorkerAssetSelectionReference {
  assets?: Record<string, EffectRuntimeWorkerAsset>;
  id: string;
}

export interface EffectRuntimeWorkerDocumentReference {
  document?: EffectV1Document;
  id: string;
}

/** Exact protocol-v5 broker-to-worker message. */
export interface EffectRuntimeWorkerMessage extends EffectRuntimeFrameRequestFields {
  renderTarget?: 'gpu-plan';
  assetSelectionRef: EffectRuntimeWorkerAssetSelectionReference;
  documentRef: EffectRuntimeWorkerDocumentReference;
  protocolVersion: typeof EFFECT_RUNTIME_PROTOCOL_VERSION;
  type: typeof EFFECT_RUNTIME_WORKER_REQUEST;
}

/** Worker-resolved request used by the interpreter. */
export interface EffectRuntimeWorkerRequest extends EffectRuntimeFrameRequestFields {
  renderTarget?: 'gpu-plan';
  assets: Record<string, EffectRuntimeWorkerAsset>;
  assetSelectionId: string;
  document: EffectV1Document;
  documentId: string;
  protocolVersion: typeof EFFECT_RUNTIME_PROTOCOL_VERSION;
  type: typeof EFFECT_RUNTIME_WORKER_REQUEST;
}

export interface EffectRuntimeFrameSuccess extends EffectRuntimeFrameIdentity {
  acknowledged: EffectRuntimeImmutableAcknowledgement;
  bitmap: ImageBitmap;
  height: number;
  kind: 'frame';
  width: number;
}

export interface EffectRuntimeFrameFailure extends EffectRuntimeFrameIdentity {
  code: Exclude<EffectRuntimeErrorCode, 'cacheMiss'>;
  kind: 'error';
}

export interface EffectRuntimeCacheMissFailure extends EffectRuntimeFrameIdentity {
  code: 'cacheMiss';
  kind: 'error';
  missingRef: 'assetSelection' | 'document';
  retryInputs?: EffectRuntimeFrameInputs;
}

export type EffectRuntimeFrameResult =
  | EffectRuntimeCacheMissFailure
  | EffectRuntimeFrameFailure
  | EffectRuntimeFrameSuccess;

export interface EffectRuntimeSandboxExecutor {
  /** Concurrent GPU preparations return independently owned resources, including bitmap fallback. */
  readonly maximumGpuFramesInFlight?: 2;
  dispose(): void;
  /** Prepare transport readiness without a frame request; an unavailable session can retry. */
  preload?(): void;
  prepareGpuFrame?(request: EffectRuntimeRenderCommand): Promise<EffectRuntimeSceneResult>;
  renderFrame(request: EffectRuntimeRenderCommand): Promise<EffectRuntimeFrameResult>;
}

export interface EffectRuntimeWorkerResponseEnvelope {
  result: EffectRuntimeWorkerResult;
  type: typeof EFFECT_RUNTIME_WORKER_RESPONSE;
}

/** Worker output. The broker forwards bounded plans only on a negotiated scene connection. */
export type EffectRuntimeSceneResult = EffectRuntimeFrameResult | EffectRuntimeGpuPlanResult;
export type EffectRuntimeWorkerResult = EffectRuntimeSceneResult;

/** Closed evaluated data. Each receiver checks identity, dimensions, operations and resources. */
export interface EffectRuntimeGpuPlanResult extends EffectRuntimeFrameIdentity {
  kind: 'gpu-plan';
  acknowledged: EffectRuntimeImmutableAcknowledgement;
  width: number;
  height: number;
  logicalWidth: number;
  logicalHeight: number;
  resources: EffectRuntimeGpuResource[];
  passes: EffectRuntimeGpuPass[];
  rootPass: number;
  inputResources: Partial<Record<EffectV1RuntimeInputName, number>>;
}
