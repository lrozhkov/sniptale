import { expect, it, vi } from 'vitest';

import {
  EFFECT_RUNTIME_SANDBOX_CONNECT_MESSAGE,
  EFFECT_RUNTIME_SANDBOX_RENDER_MESSAGE,
} from '../../contracts/effect-runtime/types';
import { attachEffectRuntimeSandbox, type EffectRuntimeSandboxWindow } from './runtime';
import type { EffectRuntimeBrokerSession } from './session';

class FakeBitmap implements ImageBitmap {
  readonly close = vi.fn();
  constructor(
    readonly width: number,
    readonly height: number
  ) {}
}

const CONNECTION_NONCE = '133a130d-543f-4b31-a4ba-52ec1c16505d';

it('accepts one parent-owned control port and returns one typed response per request', async () => {
  const parentChannel = new MessageChannel();
  const listeners: Array<Parameters<EffectRuntimeSandboxWindow['addEventListener']>[1]> = [];
  const target: EffectRuntimeSandboxWindow = {
    addEventListener: (_type, next) => {
      listeners.push(next);
    },
    parent: parentChannel.port1,
  };
  const execute = vi.fn<EffectRuntimeBrokerSession['execute']>().mockResolvedValue({
    code: 'inputRejected',
    effectInstanceId: 'instance',
    kind: 'error',
    requestId: 'request',
    sequenceId: 1,
    snapshotId: 'snapshot',
  });
  attachEffectRuntimeSandbox(target, { execute, snapshot: vi.fn() }, CONNECTION_NONCE);
  const control = new MessageChannel();
  listeners[0]!({
    data: { connectionNonce: CONNECTION_NONCE, type: EFFECT_RUNTIME_SANDBOX_CONNECT_MESSAGE },
    ports: [control.port1],
    source: parentChannel.port1,
  });
  const response = new MessageChannel();
  const result = new Promise<unknown>((resolve) => {
    response.port2.onmessage = ({ data }) => resolve(data);
  });

  control.port2.postMessage(
    { request: { requestId: 'request' }, type: EFFECT_RUNTIME_SANDBOX_RENDER_MESSAGE },
    [response.port1]
  );

  await expect(result).resolves.toMatchObject({ code: 'inputRejected', kind: 'error' });
  expect(execute).toHaveBeenCalledWith({ requestId: 'request' });
  control.port1.onmessage?.(new MessageEvent('message', { data: null }));
  control.port1.onmessageerror?.(new MessageEvent('messageerror'));
  control.port1.onmessageerror?.(new MessageEvent('messageerror'));
  control.port2.close();
  response.port2.close();
  parentChannel.port1.close();
  parentChannel.port2.close();
});

it('rejects invalid capability, repeated, and malformed connection attempts', () => {
  const parent = new MessageChannel();
  const listeners: Array<Parameters<EffectRuntimeSandboxWindow['addEventListener']>[1]> = [];
  const target: EffectRuntimeSandboxWindow = {
    addEventListener: (_type, next) => {
      listeners.push(next);
    },
    parent: parent.port1,
  };
  attachEffectRuntimeSandbox(target, { execute: vi.fn(), snapshot: vi.fn() }, CONNECTION_NONCE);
  const rejected = new MessageChannel();
  const close = vi.spyOn(rejected.port1, 'close');

  listeners[0]!({ data: { type: 'wrong' }, ports: [rejected.port1], source: parent.port2 });

  expect(close).toHaveBeenCalledOnce();
  rejected.port2.close();
  parent.port1.close();
  parent.port2.close();
});

it('does not lose an opaque sandbox connection when Chrome exposes a distinct parent proxy', () => {
  const parent = new MessageChannel();
  const listeners: Array<Parameters<EffectRuntimeSandboxWindow['addEventListener']>[1]> = [];
  const target: EffectRuntimeSandboxWindow = {
    addEventListener: (_type, next) => {
      listeners.push(next);
    },
    parent: parent.port1,
  };
  attachEffectRuntimeSandbox(target, { execute: vi.fn(), snapshot: vi.fn() }, CONNECTION_NONCE);
  const offered = new MessageChannel();
  const close = vi.spyOn(offered.port1, 'close');

  listeners[0]!({
    data: { connectionNonce: CONNECTION_NONCE, type: EFFECT_RUNTIME_SANDBOX_CONNECT_MESSAGE },
    ports: [offered.port1],
    source: parent.port2,
  });

  expect(close).not.toHaveBeenCalled();
  offered.port1.close();
  offered.port2.close();
  parent.port1.close();
  parent.port2.close();
});

it('maps rejected sandbox sessions to a typed crash response', async () => {
  const execute = vi
    .fn<EffectRuntimeBrokerSession['execute']>()
    .mockRejectedValue(new Error('session'));
  const { control, parent } = createConnectedRuntime(execute);
  const rejected = new MessageChannel();
  const crashResult = new Promise<unknown>((resolve) => {
    rejected.port2.onmessage = ({ data }) => resolve(data);
  });
  control.port1.onmessage?.(
    new MessageEvent('message', {
      data: { request: {}, type: EFFECT_RUNTIME_SANDBOX_RENDER_MESSAGE },
      ports: [rejected.port1],
    })
  );

  await expect(crashResult).resolves.toMatchObject({ code: 'crashed' });
  control.port2.close();
  rejected.port2.close();
  parent.port1.close();
  parent.port2.close();
});

it('closes a rendered frame when its response port refuses transfer', async () => {
  const bitmap = new FakeBitmap(10, 10);
  const execute = vi.fn<EffectRuntimeBrokerSession['execute']>().mockResolvedValue({
    acknowledged: { assetSelectionId: 'b'.repeat(64), documentId: 'a'.repeat(64) },
    bitmap,
    effectInstanceId: 'instance',
    height: 10,
    kind: 'frame',
    requestId: 'request',
    sequenceId: 1,
    snapshotId: 'snapshot',
    width: 10,
  });
  const { control, parent } = createConnectedRuntime(execute);
  const refusing = new MessageChannel();
  vi.spyOn(refusing.port1, 'postMessage').mockImplementation(() => {
    throw new Error('closed');
  });
  control.port1.onmessage?.(
    new MessageEvent('message', {
      data: { request: {}, type: EFFECT_RUNTIME_SANDBOX_RENDER_MESSAGE },
      ports: [refusing.port1],
    })
  );

  await vi.waitFor(() => expect(bitmap.close).toHaveBeenCalledOnce());
  control.port2.close();
  refusing.port2.close();
  parent.port1.close();
  parent.port2.close();
});

function createConnectedRuntime(execute: EffectRuntimeBrokerSession['execute']) {
  const parent = new MessageChannel();
  const listeners: Array<Parameters<EffectRuntimeSandboxWindow['addEventListener']>[1]> = [];
  const target: EffectRuntimeSandboxWindow = {
    addEventListener: (_type, next) => {
      listeners.push(next);
    },
    parent: parent.port1,
  };
  attachEffectRuntimeSandbox(target, { execute, snapshot: vi.fn() }, CONNECTION_NONCE);
  const control = new MessageChannel();
  listeners[0]!({
    data: { connectionNonce: CONNECTION_NONCE, type: EFFECT_RUNTIME_SANDBOX_CONNECT_MESSAGE },
    ports: [control.port1],
    source: parent.port1,
  });
  return { control, parent };
}
