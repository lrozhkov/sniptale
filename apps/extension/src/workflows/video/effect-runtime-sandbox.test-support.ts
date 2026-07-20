import { vi } from 'vitest';

import {
  EFFECT_RUNTIME_PROTOCOL_VERSION,
  EFFECT_RUNTIME_SANDBOX_READY_MESSAGE,
  type EffectRuntimeRenderCommand,
  type EffectRuntimeRenderMessage,
} from '../../contracts/effect-runtime/types';
import { isRecord } from '../../contracts/effect-runtime/identity';

export class FakeImageBitmap implements ImageBitmap {
  readonly close = vi.fn();

  constructor(
    readonly width: number,
    readonly height: number
  ) {}
}

class SynchronousMessagePort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null = null;
  peer: SynchronousMessagePort | null = null;

  close(): void {}

  postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions): void {
    const ports = Array.isArray(transfer) ? transfer : (transfer?.transfer ?? []);
    queueMicrotask(() => {
      const event = new MessageEvent<unknown>('message', {
        data: message,
        ports: ports.filter(isMessagePort),
      });
      this.peer?.onmessage?.(event);
    });
  }

  start(): void {}
}

class SynchronousMessageChannel {
  readonly port1 = new SynchronousMessagePort();
  readonly port2 = new SynchronousMessagePort();

  constructor() {
    this.port1.peer = this.port2;
    this.port2.peer = this.port1;
  }
}

export function installSynchronousMessageChannel(): void {
  vi.stubGlobal('MessageChannel', SynchronousMessageChannel);
}

function isMessagePort(value: unknown): value is MessagePort {
  return (
    isRecord(value) &&
    typeof value['close'] === 'function' &&
    typeof value['postMessage'] === 'function' &&
    typeof value['start'] === 'function'
  );
}

function readConnectionNonce(value: unknown): string {
  if (!isRecord(value) || typeof value['connectionNonce'] !== 'string') {
    throw new Error('Expected a sandbox connection nonce');
  }
  return value['connectionNonce'];
}

function readTransferredPort(value: unknown): MessagePort {
  if (!isRecord(value) || !Array.isArray(value['transfer'])) {
    throw new Error('Expected sandbox transfer options');
  }
  const candidate: unknown = value['transfer'][0];
  if (!isMessagePort(candidate)) throw new Error('Expected a sandbox control port');
  return candidate;
}

function isEffectRuntimeRenderMessage(value: unknown): value is EffectRuntimeRenderMessage {
  if (
    !isRecord(value) ||
    !isRecord(value['assetSelectionRef']) ||
    !isRecord(value['documentRef'])
  ) {
    return false;
  }
  const numberFields = [
    'duration',
    'fps',
    'frameIndex',
    'height',
    'progress',
    'renderHeight',
    'renderWidth',
    'sequenceId',
    'time',
    'width',
  ];
  return (
    value['kind'] === 'renderFrame' &&
    value['protocolVersion'] === EFFECT_RUNTIME_PROTOCOL_VERSION &&
    typeof value['assetSelectionRef']['id'] === 'string' &&
    typeof value['documentRef']['id'] === 'string' &&
    typeof value['effectInstanceId'] === 'string' &&
    typeof value['requestId'] === 'string' &&
    typeof value['snapshotId'] === 'string' &&
    isRecord(value['controls']) &&
    isRecord(value['inputFrames']) &&
    numberFields.every((field) => typeof value[field] === 'number')
  );
}

function readRenderMessage(value: unknown): EffectRuntimeRenderMessage {
  if (!isRecord(value) || !isEffectRuntimeRenderMessage(value['request'])) {
    throw new Error('Expected an effect runtime render message');
  }
  return value['request'];
}

function createCacheRetryResponse(request: EffectRuntimeRenderMessage, index: number): unknown {
  if (index === 1) {
    return {
      acknowledged: {
        assetSelectionId: request.assetSelectionRef.id,
        documentId: request.documentRef.id,
      },
      bitmap: new FakeImageBitmap(request.renderWidth, request.renderHeight),
      effectInstanceId: request.effectInstanceId,
      height: request.renderHeight,
      kind: 'frame',
      requestId: request.requestId,
      sequenceId: request.sequenceId,
      snapshotId: request.snapshotId,
      width: request.renderWidth,
    };
  }
  return {
    code: index === 2 ? 'cacheMiss' : 'resourceLimit',
    effectInstanceId: request.effectInstanceId,
    kind: 'error',
    ...(index === 2 ? { missingRef: 'document' } : {}),
    requestId: request.requestId,
    sequenceId: request.sequenceId,
    snapshotId: request.snapshotId,
  };
}

export function installCacheRetryResponder(
  iframe: HTMLIFrameElement,
  requests: EffectRuntimeRenderMessage[],
  ports: MessagePort[]
): void {
  installSandboxResponder(iframe, requests, ports, createCacheRetryResponse);
}

export function installSandboxResponder(
  iframe: HTMLIFrameElement,
  requests: EffectRuntimeRenderMessage[],
  ports: MessagePort[],
  respond: (
    request: EffectRuntimeRenderMessage,
    index: number,
    responsePort: MessagePort | undefined
  ) => unknown
): void {
  vi.spyOn(iframe.contentWindow!, 'postMessage').mockImplementation((message, options) => {
    const connectionNonce = readConnectionNonce(message);
    const control = readTransferredPort(options);
    ports.push(control);
    control.onmessage = (event) => {
      const request = readRenderMessage(event.data);
      requests.push(request);
      const responsePort = event.ports[0];
      const response = respond(request, requests.length, responsePort);
      if (response !== undefined) responsePort?.postMessage(response);
    };
    control.start();
    control.postMessage({ connectionNonce, type: EFFECT_RUNTIME_SANDBOX_READY_MESSAGE });
  });
}

export function respondWithResourceLimit(event: MessageEvent<unknown>): void {
  const responsePort = event.ports[0];
  if (!responsePort) throw new Error('Expected a per-request response port');
  responsePort.postMessage({
    code: 'resourceLimit',
    effectInstanceId: 'instance-1',
    kind: 'error',
    requestId: 'request-1',
    sequenceId: 1,
    snapshotId: 'effect:snapshot',
  });
}

export function createSandboxRenderRequest(bitmap?: ImageBitmap): EffectRuntimeRenderCommand {
  return {
    assetSelectionRef: { id: 'b'.repeat(64) },
    controls: {},
    documentRef: { id: 'a'.repeat(64) },
    duration: 2,
    effectInstanceId: 'instance-1',
    fps: 30,
    frameIndex: 15,
    height: 720,
    inputFrames: bitmap ? { source: { bitmap, height: 720, width: 1280 } } : {},
    materializeImmutablePayloads: async () => ({ assets: [], documentSource: '{}' }),
    progress: 0.25,
    renderHeight: 720,
    renderWidth: 1280,
    requestId: 'request-1',
    sequenceId: 1,
    snapshotId: 'effect:snapshot',
    time: 0.5,
    width: 1280,
  };
}

export function createSandboxWireRequest(bitmap?: ImageBitmap): EffectRuntimeRenderMessage {
  const command = createSandboxRenderRequest(bitmap);
  return {
    assetSelectionRef: { assets: [], id: command.assetSelectionRef.id },
    controls: command.controls,
    documentRef: { id: command.documentRef.id, source: '{}' },
    duration: command.duration,
    effectInstanceId: command.effectInstanceId,
    fps: command.fps,
    frameIndex: command.frameIndex,
    height: command.height,
    inputFrames: command.inputFrames,
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

export function createSandboxInputBitmap(): FakeImageBitmap {
  return new FakeImageBitmap(1280, 720);
}
