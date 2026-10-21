// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi, type MockInstance } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

const mocks = vi.hoisted(() => ({ send: vi.fn(), acquire: vi.fn(), stop: vi.fn() }));
vi.mock('../platform/runtime-messaging', () => ({
  createRuntimeMessagingTransport: () => ({ sendRuntimeMessage: mocks.send }),
}));
vi.mock('../platform/i18n', () => ({ createTranslator: () => (key: string) => key }));

const bootstrap = {
  type: 'recording-media-permission',
  locale: 'en',
  theme: 'dark',
  request: {
    type: VideoMessageType.VIDEO_RECORDING_SURFACE_COMMAND,
    surfaceSessionId: 'surface',
    surfaceToken: 'private-token',
    capabilityEpoch: 1,
    documentGeneration: 1,
    recordingId: null,
    command: { kind: 'list-media-devices', deviceKind: 'audioinput', requestPermission: false },
  },
};
const snapshot = {
  autoFadeDelay: 0,
  surfaceSessionId: 'surface',
  documentGeneration: 1,
  lifecycle: 'ready',
  recordingId: null,
  entry: 'manual',
  toolbarRequested: true,
  capabilityEpoch: 1,
  cursorSpotlightEnabled: false,
  peerGeneration: 0,
  status: 'IDLE',
  duration: 0,
  microphoneEnabled: false,
  microphoneDeviceId: null,
  webcamEnabled: false,
  webcamDeviceId: null,
  webcamPresentation: DEFAULT_VIDEO_SETTINGS.webcamPresentation,
  errorCode: null,
};
let listeners: MockInstance<typeof window.addEventListener>;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  document.body.replaceChildren();
  const main = document.createElement('main');
  main.hidden = true;
  const heading = document.createElement('h1');
  heading.id = 'heading';
  const status = document.createElement('p');
  status.dataset['ui'] = 'recording.media-permission.status';
  const cancel = document.createElement('button');
  cancel.dataset['ui'] = 'recording.media-permission.cancel';
  main.append(heading, status, cancel);
  document.body.append(main);
  mocks.send.mockResolvedValue({ success: true, snapshot });
  mocks.acquire.mockResolvedValue({ getTracks: () => [{ stop: mocks.stop }] });
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: mocks.acquire } });
  Reflect.set(document, 'permissionsPolicy', undefined);
  Reflect.set(document, 'featurePolicy', undefined);
  listeners = vi.spyOn(window, 'addEventListener');
  await import('./index');
});

afterEach(() => {
  window.dispatchEvent(new Event('pagehide'));
  for (const [type, listener, options] of listeners.mock.calls) {
    if (listener) window.removeEventListener(type, listener, options);
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'permissionsPolicy');
  Reflect.deleteProperty(document, 'featurePolicy');
});

function deliver(data: unknown = bootstrap, source: MessageEventSource | null = window) {
  const port = {
    postMessage: vi.fn(),
    start: vi.fn(),
    close: vi.fn(),
    onmessage: null as null | ((event: MessageEvent<unknown>) => void),
  };
  const event = new MessageEvent('message', { data, source });
  Object.defineProperty(event, 'ports', { value: [port] });
  window.dispatchEvent(event);
  return port;
}

it.each(['audioinput', 'videoinput'] as const)(
  'wires only the authorized %s source and retains it until cancellation',
  async (deviceKind) => {
    const port = deliver({
      ...bootstrap,
      request: { ...bootstrap.request, command: { ...bootstrap.request.command, deviceKind } },
    });
    await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalledWith({ status: 'granted' }));
    expect(port.postMessage).toHaveBeenCalledWith({ status: 'ready' });
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.acquire).toHaveBeenCalledExactlyOnceWith({
      audio: deviceKind === 'audioinput',
      video: deviceKind === 'videoinput',
    });
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(document.querySelector('main')!.hidden).toBe(false);
    expect(document.querySelector('h1')!.textContent).toContain(
      deviceKind === 'audioinput' ? 'Microphone' : 'Camera'
    );
    expect(mocks.stop).not.toHaveBeenCalled();
    port.onmessage?.(new MessageEvent('message', { data: { type: 'other' } }));
    expect(mocks.stop).not.toHaveBeenCalled();
    deliver();
    expect(mocks.send).toHaveBeenCalledOnce();
    port.onmessage?.(new MessageEvent('message', { data: { type: 'cancel' } }));
    expect(mocks.stop).toHaveBeenCalledOnce();
    expect(port.postMessage).toHaveBeenLastCalledWith({ status: 'cancelled' });
    window.dispatchEvent(new Event('unload'));
    expect(port.close).toHaveBeenCalledOnce();
  }
);

it('ignores foreign, malformed, and portless bootstrap messages', () => {
  deliver(bootstrap, null);
  deliver({ ...bootstrap, theme: 'invalid' });
  window.dispatchEvent(new MessageEvent('message', { data: bootstrap, source: window }));
  expect(mocks.send).not.toHaveBeenCalled();
});

it.each(['main', '#heading', 'p', 'button'])(
  'fails closed without required UI node %s',
  (selector) => {
    document.querySelector(selector)!.remove();
    const port = deliver();
    expect(port.close).toHaveBeenCalledOnce();
    expect(mocks.send).not.toHaveBeenCalled();
  }
);

it('reports rejected authority without requesting a device and lets the user dismiss it', async () => {
  mocks.send.mockResolvedValue({ success: false });
  const port = deliver();
  await vi.waitFor(() =>
    expect(port.postMessage).toHaveBeenCalledWith({ status: 'failed', reason: 'unauthorized' })
  );
  expect(document.querySelector('[role="alert"]')!.textContent).toContain('PermissionUnauthorized');
  expect(mocks.acquire).not.toHaveBeenCalled();
  const button = document.querySelector('button')!;
  expect(button.getAttribute('aria-label')).toBe('common.actions.close');
  button.click();
  expect(port.postMessage).toHaveBeenLastCalledWith({ status: 'cancelled' });
});

it.each([
  {
    error: new DOMException('Denied', 'NotAllowedError'),
    reason: 'denied',
    copy: 'PermissionDenied',
  },
  { error: new Error('Device missing'), reason: 'unavailable', copy: 'PermissionFailed' },
])('presents acquisition failure $reason', async ({ error, reason, copy }) => {
  mocks.acquire.mockRejectedValue(error);
  const port = deliver();
  await vi.waitFor(() =>
    expect(port.postMessage).toHaveBeenCalledWith({ status: 'failed', reason })
  );
  expect(document.querySelector('[role="alert"]')!.textContent).toContain(copy);
});

it('honors a restrictive host feature policy', async () => {
  const allowsFeature = vi.fn(() => false);
  Reflect.set(document, 'featurePolicy', { allowsFeature });
  const port = deliver();
  await vi.waitFor(() =>
    expect(port.postMessage).toHaveBeenCalledWith({ status: 'failed', reason: 'policy' })
  );
  expect(allowsFeature).toHaveBeenCalledWith('microphone');
  expect(mocks.acquire).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alert"]')!.textContent).toContain('PermissionPolicy');
});

it('tolerates an unavailable policy API while keeping native acquisition authoritative', async () => {
  Reflect.set(document, 'permissionsPolicy', { allowsFeature: 'unavailable' });
  const port = deliver();
  await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalledWith({ status: 'granted' }));
  window.dispatchEvent(new Event('pagehide'));
  expect(mocks.stop).toHaveBeenCalledOnce();
  expect(port.close).toHaveBeenCalledOnce();
});
