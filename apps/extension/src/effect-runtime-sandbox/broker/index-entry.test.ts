import { afterEach, expect, it, vi } from 'vitest';

import { sha256EffectV1Bytes } from '@sniptale/runtime-contracts/effect-v1';
import { createEffectRuntimeAssetSelectionId } from '../../contracts/effect-runtime/immutable-refs';

import {
  EFFECT_RUNTIME_PROTOCOL_VERSION,
  EFFECT_RUNTIME_SANDBOX_CONNECT_MESSAGE,
  EFFECT_RUNTIME_SANDBOX_READY_MESSAGE,
  EFFECT_RUNTIME_SANDBOX_RENDER_MESSAGE,
} from '../../contracts/effect-runtime/types';
import { createDocument } from '../worker/interpreter/support.test-support';

vi.mock('../worker/index?worker&inline', () => ({
  default: class FakeWorker {
    onerror = null;
    onmessage = null;
    onmessageerror = null;
    postMessage(): void {
      throw new Error('worker unavailable');
    }
    terminate(): void {}
  },
}));

const CONNECTION_NONCE = '133a130d-543f-4b31-a4ba-52ec1c16505d';
type SandboxListener = (event: {
  data: unknown;
  ports: readonly MessagePort[];
  source: MessageEventSource | null;
}) => void;

afterEach(() => {
  vi.unstubAllGlobals();
});

it('installs the guarded broker entrypoint on the sandbox window', async () => {
  vi.resetModules();
  const parent = new MessageChannel();
  const listeners: SandboxListener[] = [];
  const addEventListener = vi.fn((_type, next) => {
    listeners.push(next);
  });
  const sandboxWindow = {
    addEventListener,
    location: { hash: `#connectionNonce=${CONNECTION_NONCE}` },
    parent: parent.port1,
  };
  vi.stubGlobal('window', sandboxWindow);

  await import('../index');

  expect(addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
  expect(() => Reflect.get(sandboxWindow, 'fetch')).toThrow(
    'SNIPTALE_EFFECT_RUNTIME_API_DENIED:fetch'
  );
  await connectAndExecute(listeners[0]!, parent);
});

it('does not attach a broker when the URL capability is absent', async () => {
  vi.resetModules();
  const parent = new MessageChannel();
  const addEventListener = vi.fn();
  const sandboxWindow = {
    addEventListener,
    location: { hash: '' },
    parent: parent.port1,
  };
  vi.stubGlobal('window', sandboxWindow);

  await import('../index');

  expect(addEventListener).not.toHaveBeenCalled();
  expect(() => Reflect.get(sandboxWindow, 'fetch')).toThrow(
    'SNIPTALE_EFFECT_RUNTIME_API_DENIED:fetch'
  );
  parent.port1.close();
  parent.port2.close();
});

async function connectAndExecute(listener: SandboxListener, parent: MessageChannel): Promise<void> {
  const control = new MessageChannel();
  listener({
    data: { connectionNonce: CONNECTION_NONCE, type: EFFECT_RUNTIME_SANDBOX_CONNECT_MESSAGE },
    ports: [control.port1],
    source: parent.port1,
  });
  const response = new MessageChannel();
  const ready = new Promise<unknown>((resolve) => {
    control.port2.onmessage = ({ data }) => resolve(data);
  });
  await expect(ready).resolves.toEqual({
    connectionNonce: CONNECTION_NONCE,
    type: EFFECT_RUNTIME_SANDBOX_READY_MESSAGE,
  });
  const result = new Promise<unknown>((resolve) => {
    response.port2.onmessage = ({ data }) => resolve(data);
  });
  control.port2.postMessage(
    { request: await createMessage(), type: EFFECT_RUNTIME_SANDBOX_RENDER_MESSAGE },
    [response.port1]
  );
  await expect(result).resolves.toMatchObject({ code: 'crashed' });
  control.port2.close();
  response.port2.close();
  parent.port1.close();
  parent.port2.close();
}

async function createMessage() {
  const documentSource = JSON.stringify(createDocument([{ op: 'clear' }]));
  const documentSha256 = await sha256EffectV1Bytes(new TextEncoder().encode(documentSource));
  const assetSelectionId = await createEffectRuntimeAssetSelectionId([]);
  return {
    assetSelectionRef: { assets: [], id: assetSelectionId },
    controls: {},
    documentRef: { id: documentSha256, source: documentSource },
    duration: 2,
    effectInstanceId: 'instance',
    fps: 30,
    frameIndex: 30,
    height: 10,
    inputFrames: {},
    kind: 'renderFrame',
    progress: 0.5,
    protocolVersion: EFFECT_RUNTIME_PROTOCOL_VERSION,
    renderHeight: 10,
    renderWidth: 10,
    requestId: 'request',
    sequenceId: 1,
    snapshotId: `effect:${documentSha256}`,
    time: 1,
    width: 10,
  };
}
