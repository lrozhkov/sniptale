import {
  EFFECT_RUNTIME_WORKER_REQUEST,
  type EffectRuntimeErrorCode,
  type EffectRuntimeRenderRequest,
  type EffectRuntimeWorkerMessage,
} from '../../contracts/effect-runtime/types';

export class EffectRuntimePreparationError extends Error {
  readonly code: Exclude<EffectRuntimeErrorCode, 'cacheMiss'>;

  constructor(code: Exclude<EffectRuntimeErrorCode, 'cacheMiss'>) {
    super(`Effect runtime preparation failed: ${code}`);
    this.name = 'EffectRuntimePreparationError';
    this.code = code;
  }
}

/** The verified package owns its local image and font bytes. The broker does not decode them. */
export async function prepareEffectRuntimeWorkerRequest(
  request: EffectRuntimeRenderRequest
): Promise<EffectRuntimeWorkerMessage> {
  if (request.assets.length !== 0 || Object.keys(request.inputFrames).length !== 0) {
    throw new EffectRuntimePreparationError('inputRejected');
  }
  return {
    assetSelectionRef: {
      id: request.assetSelectionId,
      ...(request.assetSelectionPayloadIncluded ? { assets: {} } : {}),
    },
    controls: request.controls,
    documentRef: {
      id: request.documentId,
      ...(request.documentPayloadIncluded ? { document: request.document } : {}),
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
