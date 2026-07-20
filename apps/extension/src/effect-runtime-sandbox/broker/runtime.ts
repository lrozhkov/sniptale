import {
  createEffectRuntimeFailure,
  hasExactKeys,
  isRecord,
} from '../../contracts/effect-runtime/identity';
import { closeEffectRuntimeBitmaps } from '../../contracts/effect-runtime/bitmap-lifetime';
import {
  EFFECT_RUNTIME_SANDBOX_CONNECT_MESSAGE,
  EFFECT_RUNTIME_SANDBOX_READY_MESSAGE,
  EFFECT_RUNTIME_SANDBOX_RENDER_MESSAGE,
  type EffectRuntimeFrameResult,
} from '../../contracts/effect-runtime/types';
import type { EffectRuntimeBrokerSession } from './session';

interface SandboxMessageEvent {
  data: unknown;
  ports: readonly MessagePort[];
  source: MessageEventSource | null;
}

export interface EffectRuntimeSandboxWindow {
  readonly parent: MessageEventSource | null;
  addEventListener(type: 'message', listener: (event: SandboxMessageEvent) => void): void;
}

export function attachEffectRuntimeSandbox(
  targetWindow: EffectRuntimeSandboxWindow,
  session: EffectRuntimeBrokerSession,
  connectionNonce: string
): void {
  let connected = false;
  targetWindow.addEventListener('message', (event) => {
    const isConnect =
      isRecord(event.data) &&
      hasExactKeys(event.data, ['connectionNonce', 'type']) &&
      event.data['connectionNonce'] === connectionNonce &&
      event.data['type'] === EFFECT_RUNTIME_SANDBOX_CONNECT_MESSAGE;
    if (!isConnect || connected || event.ports.length !== 1) {
      for (const port of event.ports) port.close();
      return;
    }
    connected = true;
    attachControlPort(event.ports[0]!, session, connectionNonce);
  });
}

function attachControlPort(
  controlPort: MessagePort,
  session: EffectRuntimeBrokerSession,
  connectionNonce: string
): void {
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    controlPort.onmessage = null;
    controlPort.onmessageerror = null;
    controlPort.close();
  };
  controlPort.onmessage = (event) => {
    const valid =
      isRecord(event.data) &&
      hasExactKeys(event.data, ['request', 'type']) &&
      event.data['type'] === EFFECT_RUNTIME_SANDBOX_RENDER_MESSAGE &&
      event.ports.length === 1;
    if (!valid) {
      closeEffectRuntimeBitmaps(event.data);
      for (const port of event.ports) port.close();
      return;
    }
    executeRequest(event.ports[0]!, event.data['request'], session);
  };
  controlPort.onmessageerror = close;
  controlPort.start();
  try {
    controlPort.postMessage({
      connectionNonce,
      type: EFFECT_RUNTIME_SANDBOX_READY_MESSAGE,
    });
  } catch {
    close();
  }
}

function executeRequest(
  port: MessagePort,
  request: unknown,
  session: EffectRuntimeBrokerSession
): void {
  void session.execute(request).then(
    (result) => {
      postResult(port, result);
      port.close();
    },
    () => {
      postResult(port, createEffectRuntimeFailure(request, 'crashed'));
      port.close();
    }
  );
}

function postResult(port: MessagePort, result: EffectRuntimeFrameResult): void {
  try {
    port.postMessage(result, result.kind === 'frame' ? [result.bitmap] : []);
  } catch {
    if (result.kind === 'frame') result.bitmap.close();
  }
}
