import { closeEffectRuntimeBitmaps } from '../../contracts/effect-runtime/bitmap-lifetime';
import { createEffectRuntimeFailure } from '../../contracts/effect-runtime/identity';
import {
  EFFECT_RUNTIME_PROTOCOL_VERSION,
  type EffectRuntimeFrameInputs,
  type EffectRuntimeFrameResult,
  type EffectRuntimeRenderCommand,
  type EffectRuntimeRenderMessage,
} from '../../contracts/effect-runtime/types';
import {
  PendingEffectRuntimeRequest,
  type EffectRuntimeSandboxConnection,
} from './effect-runtime-sandbox-request';

export interface EffectRuntimeSandboxSession extends EffectRuntimeSandboxConnection {
  cancelLoad(): void;
  controlPort: MessagePort | null;
  iframe: HTMLIFrameElement;
  load: Promise<void>;
}

export interface EffectRuntimeSandboxRenderAuthority {
  active: Set<PendingEffectRuntimeRequest>;
  acknowledgedAssetSelections: Set<string>;
  acknowledgedDocuments: Set<string>;
  clearAcknowledgements(): void;
  clearSession(expected?: EffectRuntimeSandboxSession | null): void;
  ensureSession(): EffectRuntimeSandboxSession;
  isCurrentSession(session: EffectRuntimeSandboxSession): boolean;
  isDisposed(): boolean;
  requestTimeoutMs: number;
}

function failUntransferredRequest(command: EffectRuntimeRenderCommand): EffectRuntimeFrameResult {
  closeEffectRuntimeBitmaps(command.inputFrames);
  return createEffectRuntimeFailure(command, 'crashed');
}

async function createRenderMessage(
  command: EffectRuntimeRenderCommand,
  options: {
    inputFrames: EffectRuntimeFrameInputs;
    sendFullAssets: boolean;
    sendFullDocument: boolean;
  }
): Promise<EffectRuntimeRenderMessage> {
  const payloads =
    options.sendFullAssets || options.sendFullDocument
      ? await command.materializeImmutablePayloads()
      : null;
  return {
    assetSelectionRef: {
      id: command.assetSelectionRef.id,
      ...(options.sendFullAssets ? { assets: payloads!.assets } : {}),
    },
    controls: command.controls,
    documentRef: {
      id: command.documentRef.id,
      ...(options.sendFullDocument ? { source: payloads!.documentSource } : {}),
    },
    duration: command.duration,
    effectInstanceId: command.effectInstanceId,
    fps: command.fps,
    frameIndex: command.frameIndex,
    height: command.height,
    inputFrames: options.inputFrames,
    kind: 'renderFrame',
    progress: command.progress,
    protocolVersion: EFFECT_RUNTIME_PROTOCOL_VERSION,
    renderHeight: command.renderHeight,
    renderWidth: command.renderWidth,
    requestId: command.requestId,
    sequenceId: command.sequenceId,
    snapshotId: command.snapshotId,
    time: command.time,
    width: command.width,
  };
}

async function cloneFrameInputs(
  inputFrames: EffectRuntimeFrameInputs
): Promise<EffectRuntimeFrameInputs> {
  const clones: EffectRuntimeFrameInputs = {};
  try {
    for (const [name, frame] of Object.entries(inputFrames)) {
      clones[name as keyof EffectRuntimeFrameInputs] = {
        bitmap: await createImageBitmap(frame.bitmap),
        height: frame.height,
        width: frame.width,
      };
    }
    return clones;
  } catch (error) {
    closeEffectRuntimeBitmaps(clones);
    throw error;
  }
}

function sendRenderRequest(
  authority: EffectRuntimeSandboxRenderAuthority,
  current: EffectRuntimeSandboxSession,
  request: EffectRuntimeRenderMessage
): Promise<EffectRuntimeFrameResult> {
  return new PendingEffectRuntimeRequest({
    active: authority.active,
    clearSession: () => authority.clearSession(current),
    current,
    request,
    timeoutMs: authority.requestTimeoutMs,
  }).start();
}

function rejectStaleSessionResult(
  authority: EffectRuntimeSandboxRenderAuthority,
  current: EffectRuntimeSandboxSession,
  command: EffectRuntimeRenderCommand,
  result: EffectRuntimeFrameResult
): EffectRuntimeFrameResult | null {
  if (authority.isCurrentSession(current)) return null;
  if (result.kind === 'frame') result.bitmap.close();
  return createEffectRuntimeFailure(command, 'stale');
}

function forgetMissingRef(
  authority: EffectRuntimeSandboxRenderAuthority,
  command: EffectRuntimeRenderCommand,
  missingRef: 'assetSelection' | 'document'
): void {
  const acknowledged =
    missingRef === 'document'
      ? authority.acknowledgedDocuments
      : authority.acknowledgedAssetSelections;
  acknowledged.delete(
    missingRef === 'document' ? command.documentRef.id : command.assetSelectionRef.id
  );
}

async function requestFrameWithCacheRetry(
  authority: EffectRuntimeSandboxRenderAuthority,
  current: EffectRuntimeSandboxSession,
  command: EffectRuntimeRenderCommand
): Promise<EffectRuntimeFrameResult> {
  const sendFullDocument = !authority.acknowledgedDocuments.has(command.documentRef.id);
  const sendFullAssets = !authority.acknowledgedAssetSelections.has(command.assetSelectionRef.id);
  let retryInputs =
    (!sendFullDocument || !sendFullAssets) && Object.keys(command.inputFrames).length > 0
      ? await cloneFrameInputs(command.inputFrames)
      : null;
  try {
    const request = await createRenderMessage(command, {
      inputFrames: command.inputFrames,
      sendFullAssets,
      sendFullDocument,
    });
    let result = await sendRenderRequest(authority, current, request);
    const staleInitial = rejectStaleSessionResult(authority, current, command, result);
    if (staleInitial) return staleInitial;
    if (result.kind === 'error' && result.code === 'cacheMiss') {
      forgetMissingRef(authority, command, result.missingRef);
      const retry = await createRenderMessage(command, {
        inputFrames: retryInputs ?? {},
        sendFullAssets: true,
        sendFullDocument: true,
      });
      retryInputs = null;
      result = await sendRenderRequest(authority, current, retry);
      const staleRetry = rejectStaleSessionResult(authority, current, command, result);
      if (staleRetry) return staleRetry;
      if (result.kind === 'error' && result.code === 'cacheMiss') authority.clearSession(current);
    }
    return result;
  } finally {
    closeEffectRuntimeBitmaps(retryInputs);
  }
}

function rememberBounded(authority: Set<string>, id: string, maximum: number): void {
  authority.delete(id);
  while (authority.size >= maximum) {
    const oldest = authority.values().next().value;
    if (typeof oldest !== 'string') break;
    authority.delete(oldest);
  }
  authority.add(id);
}

function acceptRenderResult(
  authority: EffectRuntimeSandboxRenderAuthority,
  current: EffectRuntimeSandboxSession,
  command: EffectRuntimeRenderCommand,
  result: EffectRuntimeFrameResult
): EffectRuntimeFrameResult {
  if (result.kind === 'frame') {
    const expected =
      result.acknowledged.documentId === command.documentRef.id &&
      result.acknowledged.assetSelectionId === command.assetSelectionRef.id;
    if (!expected) {
      result.bitmap.close();
      authority.clearSession(current);
      return createEffectRuntimeFailure(command, 'outputRejected');
    }
    rememberBounded(authority.acknowledgedDocuments, result.acknowledged.documentId, 8);
    rememberBounded(
      authority.acknowledgedAssetSelections,
      result.acknowledged.assetSelectionId,
      64
    );
  } else if (['crashed', 'malformed', 'stale'].includes(result.code)) {
    authority.clearSession(current);
  } else if (result.code === 'timeout' || result.code === 'outputRejected') {
    authority.clearAcknowledgements();
  }
  return result;
}

export async function renderEffectRuntimeSandboxFrame(
  authority: EffectRuntimeSandboxRenderAuthority,
  command: EffectRuntimeRenderCommand
): Promise<EffectRuntimeFrameResult> {
  if (authority.isDisposed()) return failUntransferredRequest(command);
  try {
    const current = authority.ensureSession();
    await current.load;
    if (authority.isDisposed() || !authority.isCurrentSession(current)) {
      return failUntransferredRequest(command);
    }
    const result = await requestFrameWithCacheRetry(authority, current, command);
    const stale = rejectStaleSessionResult(authority, current, command, result);
    if (stale) return stale;
    return acceptRenderResult(authority, current, command, result);
  } catch {
    authority.clearSession();
    closeEffectRuntimeBitmaps(command.inputFrames);
    return createEffectRuntimeFailure(command, 'crashed');
  }
}
