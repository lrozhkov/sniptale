import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRuntimePortFixture } from '../../../../../tooling/test/support/chrome-runtime-port';
import { runImageEditorJob } from './client';
import { IMAGE_JOB_PORT_NAME, type ImageJobStart } from '../../contracts/ai/image';

const remote = vi.hoisted(() => ({ connect: vi.fn(), approve: vi.fn() }));
vi.mock('@sniptale/platform/browser/runtime', () => ({
  browserRuntime: { connect: remote.connect, getLastError: () => undefined },
}));
vi.mock('../../features/ai/egress-authority', () => ({
  createImageEditorEgressAuthority: async () => ({
    purpose: 'image-editor',
    contractVersion: 1,
    payloadHash: `sha256:${'a'.repeat(64)}`,
  }),
}));
vi.mock('../../workflows/ai-session/llm-session', () => ({
  requestLlmSessionToken: remote.approve,
}));
const uuid = 'fdd43bfc-2c5b-416e-91b2-d2c2cc820ac7';
const request: Omit<ImageJobStart, 'llmSessionToken'> = {
  type: 'start',
  requestId: uuid,
  modelId: 'model',
  approvedModelCode: 'code',
  approvedProviderId: 'provider',
  approvedDestination: `sha256:${'a'.repeat(64)}`,
  scope: { documentId: 'doc', sessionId: uuid, snapshotId: uuid },
  context: {
    version: 1,
    intention: 'new-image',
    prompt: 'Draw',
    images: [],
    parameters: { variants: 1 },
  },
};
const image = {
  dataUrl:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFElEQVR4AWKS8Mj5D8JMDFAAZwAAAAD//238wugAAAAGSURBVAMATl0DnQxeRbkAAAAASUVORK5CYII=',
  width: 2,
  height: 3,
};
let port: ReturnType<typeof createRuntimePortFixture>;
beforeEach(() => {
  vi.clearAllMocks();
  port = createRuntimePortFixture({ name: IMAGE_JOB_PORT_NAME });
  remote.connect.mockReturnValue(port.port);
  remote.approve.mockResolvedValue('token');
});
afterEach(() => vi.useRealTimers());
async function ready() {
  await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalled());
}

it('approves once, parses correlated incremental images and cleans the port after completion', async () => {
  const receive = vi.fn();
  const flight = runImageEditorJob({ request, signal: new AbortController().signal, receive });
  await ready();
  expect(remote.approve).toHaveBeenCalledTimes(1);
  expect(port.postMessage).toHaveBeenCalledWith({ ...request, llmSessionToken: 'token' });
  port.onMessage.emit({ type: 'image', requestId: uuid, variant: 0, image });
  port.onMessage.emit({ type: 'complete', requestId: uuid, received: 1 });
  await flight;
  expect(receive).toHaveBeenCalledTimes(2);
  expect(port.disconnect).toHaveBeenCalledOnce();
  port.onMessage.emit({ type: 'image', requestId: uuid, variant: 0, image });
  expect(receive).toHaveBeenCalledTimes(2);
});
it('retains delivered previews on failure and performs no paid retry', async () => {
  const receive = vi.fn();
  const flight = runImageEditorJob({
    request: { ...request, context: { ...request.context, parameters: { variants: 3 } } },
    signal: new AbortController().signal,
    receive,
  });
  const failed = expect(flight).rejects.toThrow('provider-failed');
  await ready();
  port.onMessage.emit({ type: 'image', requestId: uuid, variant: 0, image });
  port.onMessage.emit({ type: 'failure', requestId: uuid, code: 'provider-failed' });
  await failed;
  expect(receive.mock.calls[0]?.[0]).toMatchObject({ type: 'image' });
  expect(remote.connect).toHaveBeenCalledOnce();
  expect(remote.approve).toHaveBeenCalledOnce();
});
it('cancels and disconnects before accepting late replies', async () => {
  const controller = new AbortController(),
    receive = vi.fn();
  const flight = runImageEditorJob({ request, signal: controller.signal, receive });
  const stopped = expect(flight).rejects.toThrow('cancelled');
  await ready();
  controller.abort();
  await stopped;
  expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'cancel', requestId: uuid });
  port.onMessage.emit({ type: 'image', requestId: uuid, variant: 0, image });
  expect(receive).not.toHaveBeenCalled();
});
it('rejects malformed or duplicate result traffic without replaying the request', async () => {
  const receive = vi.fn();
  const flight = runImageEditorJob({ request, signal: new AbortController().signal, receive });
  const rejected = expect(flight).rejects.toThrow('invalid-response');
  await ready();
  port.onMessage.emit({ type: 'image', requestId: uuid, variant: 0, image });
  port.onMessage.emit({ type: 'image', requestId: uuid, variant: 0, image });
  await rejected;
  expect(receive).toHaveBeenCalledOnce();
  expect(remote.connect).toHaveBeenCalledOnce();
});
