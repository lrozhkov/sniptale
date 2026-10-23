// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createRecordingPermissionFrameOwner } from './permission-frame';

vi.mock('../../../../platform/i18n', () => ({
  getCurrentLocale: () => 'en',
  translate: (key: string) => key,
}));
vi.mock('../../../platform/dom-host', () => ({
  appendToContentOverlayRoot: (node: Node) => document.body.appendChild(node),
  resolveContentShadowRoot: () => null,
}));

const identity = {
  surfaceSessionId: 'surface',
  surfaceToken: 'private-token',
  capabilityEpoch: 2,
  documentGeneration: 1,
  peerGeneration: 3,
  recordingId: null,
};

function setup() {
  const port = {
    onmessage: null as null | ((event: MessageEvent<unknown>) => void),
    start: vi.fn(),
    close: vi.fn(),
    postMessage: vi.fn(),
  };
  const transfer = {};
  const createChannel = vi.fn().mockReturnValue({ port1: port, port2: transfer });
  const owner = createRecordingPermissionFrameOwner({
    createChannel,
    url: () => 'chrome-extension://owned/apps/extension/src/media-permission/index.html',
    origin: () => 'chrome-extension://owned/',
    mount: (frame) => document.body.appendChild(frame),
  });
  return { owner, port, transfer, createChannel };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

it('uses a private exact-origin bootstrap, coalesces requests and retains one-time grants', async () => {
  const { owner, port, transfer, createChannel } = setup();
  const pending = owner.request(identity, 'audioinput');
  expect(owner.request(identity, 'audioinput')).toBe(pending);
  const frame = document.querySelector('iframe')!;
  expect(frame.style.borderRadius).toBe('8px');
  expect(frame.src).not.toContain('private-token');
  expect(frame.allow).toBe('camera chrome-extension://owned; microphone chrome-extension://owned');
  frame.src = 'chrome-extension://dynamic-resource/apps/extension/src/media-permission/index.html';
  const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => undefined);
  frame.dispatchEvent(new Event('load'));
  expect(post).toHaveBeenCalledWith(
    expect.objectContaining({
      request: expect.objectContaining({
        surfaceToken: 'private-token',
        command: {
          kind: 'list-media-devices',
          deviceKind: 'audioinput',
          requestPermission: false,
        },
      }),
    }),
    'chrome-extension://owned',
    [transfer]
  );
  port.onmessage?.(new MessageEvent('message', { data: { status: 'ready' } }));
  port.onmessage?.(new MessageEvent('message', { data: { status: 'granted' } }));
  await pending;
  expect(frame.isConnected).toBe(true);
  expect(frame.style.visibility).toBe('hidden');
  expect(createChannel).toHaveBeenCalledOnce();
  owner.release('audioinput');
  expect(frame.isConnected).toBe(false);
  expect(port.postMessage).toHaveBeenCalledWith({ type: 'cancel' });
  expect(port.close).toHaveBeenCalledOnce();
});

it('ignores malformed results and cancels pending acquisition on disposal', async () => {
  const { owner, port } = setup();
  const pending = owner.request(identity, 'videoinput');
  const rejected = expect(pending).rejects.toThrow();
  port.onmessage?.(new MessageEvent('message', { data: { status: 'granted', extra: true } }));
  expect(document.querySelector('iframe')!.style.visibility).toBe('hidden');
  owner.release();
  await rejected;
  expect(document.querySelector('iframe')).toBeNull();
});

it('bounds blocked bootstrap without timing out the native permission prompt', async () => {
  vi.useFakeTimers();
  const blocked = setup();
  const rejected = expect(blocked.owner.request(identity, 'audioinput')).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(10_000);
  await rejected;
  const waiting = setup();
  const pending = waiting.owner.request(identity, 'audioinput');
  waiting.port.onmessage?.(new MessageEvent('message', { data: { status: 'ready' } }));
  await vi.advanceTimersByTimeAsync(120_000);
  expect(document.querySelector('iframe')).not.toBeNull();
  waiting.port.onmessage?.(new MessageEvent('message', { data: { status: 'granted' } }));
  await pending;
  waiting.owner.release();
});

it('keeps the failure visible and allows a fresh request after a rejection', async () => {
  const { owner, port, createChannel } = setup();
  const rejected = expect(owner.request(identity, 'audioinput')).rejects.toThrow();
  port.onmessage?.(new MessageEvent('message', { data: { status: 'failed', reason: 'denied' } }));
  await rejected;
  expect(document.querySelector('iframe')).not.toBeNull();
  const retry = owner.request(identity, 'audioinput');
  expect(createChannel).toHaveBeenCalledTimes(2);
  const retryRejected = expect(retry).rejects.toThrow();
  owner.release();
  await retryRejected;
});
