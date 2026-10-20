// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PopupMediaAccessError } from '../../../media-devices';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  subscribe: vi.fn(),
  requestMicrophone: vi.fn(),
  requestCamera: vi.fn(),
  openSettings: vi.fn(),
}));

vi.mock('../../../../../platform/i18n/popup', () => ({ translate: (key: string) => key }));
vi.mock('../../../../../platform/navigation/extension-pages', () => ({
  openSettingsPage: mocks.openSettings,
}));
vi.mock('../../../media-devices', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../media-devices')>()),
  readPopupMediaAccessState: mocks.read,
  subscribeToPopupMediaAccessChanges: mocks.subscribe,
}));
vi.mock('../../../microphone', () => ({ requestMicrophonePermission: mocks.requestMicrophone }));
vi.mock('../../../webcam', () => ({ requestWebcamPermission: mocks.requestCamera }));

import { MediaAccessBoundary } from './media-access';

let root: Root;
let container: HTMLDivElement;
let change: (state: 'granted' | 'denied' | 'prompt') => void;
let unsubscribe: () => void;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.resetAllMocks();
  unsubscribe = vi.fn();
  mocks.read.mockResolvedValue('prompt');
  mocks.subscribe.mockImplementation(async (_kind, listener) => {
    change = listener;
    return unsubscribe;
  });
  mocks.requestMicrophone.mockResolvedValue(undefined);
  mocks.requestCamera.mockResolvedValue(undefined);
  mocks.openSettings.mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render(node: ReactNode) {
  await act(async () => root.render(node));
}

function boundary(permissionName: 'microphone' | 'camera', onGranted = vi.fn()) {
  return (
    <MediaAccessBoundary
      permissionName={permissionName}
      deviceId="saved-device"
      label={permissionName}
      onGranted={onGranted}
    >
      <span data-ready>Selected device</span>
    </MediaAccessBoundary>
  );
}

it('shows missing access instead of a ready device and grants only after explicit request succeeds', async () => {
  const refresh = vi.fn().mockResolvedValue(undefined);
  await render(boundary('microphone', refresh));
  expect(container.querySelector('[data-ready]')).toBeNull();
  expect(container.textContent).toContain('popup.video.microphonePermissionRequired');
  expect(mocks.requestMicrophone).not.toHaveBeenCalled();
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[data-ui="popup.video.microphone-request-access"]')
      ?.click()
  );
  expect(mocks.requestMicrophone).toHaveBeenCalledWith('saved-device');
  expect(refresh).toHaveBeenCalledOnce();
  expect(container.querySelector('[data-ready]')).not.toBeNull();
});

it('preserves a refused camera selection and opens the existing Permissions settings surface', async () => {
  mocks.requestCamera.mockRejectedValue(new PopupMediaAccessError('camera', 'denied'));
  const refresh = vi.fn();
  await render(boundary('camera', refresh));
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[data-ui="popup.video.camera-request-access"]')
      ?.click()
  );
  expect(mocks.requestCamera).toHaveBeenCalledWith('saved-device');
  expect(refresh).not.toHaveBeenCalled();
  expect(container.querySelector('[data-ready]')).toBeNull();
  expect(container.textContent).toContain('popup.video.cameraPermissionDenied');
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[data-ui="popup.video.camera-open-permissions"]')
      ?.click()
  );
  expect(mocks.openSettings).toHaveBeenCalledWith({
    route: { section: 'access-data', view: 'permissions' },
  });
});

it('keeps disabled devices off after a successful access request', async () => {
  mocks.read.mockResolvedValue('denied');
  const refresh = vi.fn().mockResolvedValue(undefined);
  await render(
    <MediaAccessBoundary
      permissionName="microphone"
      deviceId="saved-device"
      label="Microphone"
      enabled={false}
      onGranted={refresh}
    >
      <span data-ready>Selected microphone</span>
    </MediaAccessBoundary>
  );
  expect(container.textContent).toContain('popup.video.mediaAccessBlocked');
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[data-ui="popup.video.microphone-request-access"]')
      ?.click()
  );
  expect(mocks.requestMicrophone).toHaveBeenCalledWith('saved-device');
  expect(refresh).toHaveBeenCalledOnce();
  expect(container.querySelector('[data-ready]')).toBeNull();
  expect(container.textContent).toBe('');
});

it('allows an explicit request when permission queries are unavailable and contains Settings failure', async () => {
  mocks.read.mockResolvedValue('unknown');
  mocks.openSettings.mockRejectedValue(new Error('private failure'));
  await render(boundary('camera'));
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[data-ui="popup.video.camera-open-permissions"]')
      ?.click()
  );
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    'popup.video.mediaAccessUnconfirmed'
  );
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[data-ui="popup.video.camera-request-access"]')
      ?.click()
  );
  expect(mocks.requestCamera).toHaveBeenCalledOnce();
  expect(container.querySelector('[data-ready]')).not.toBeNull();
});

it('finishes checking after a refused explicit request even when the initial query is unresolved', async () => {
  mocks.read.mockReturnValue(new Promise(() => undefined));
  mocks.requestCamera.mockRejectedValue(new PopupMediaAccessError('camera', 'denied'));
  await render(boundary('camera'));
  expect(container.textContent).toContain('popup.video.mediaCheckingAccess');
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[data-ui="popup.video.camera-request-access"]')
      ?.click()
  );
  expect(container.textContent).toContain('popup.video.cameraPermissionDenied');
  expect(container.textContent).not.toContain('popup.video.mediaCheckingAccess');
});

it('preserves a successful grant when advisory inventory refresh fails', async () => {
  const refresh = vi.fn().mockRejectedValue(new Error('inventory unavailable'));
  await render(boundary('camera', refresh));
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[data-ui="popup.video.camera-request-access"]')
      ?.click()
  );
  expect(container.querySelector('[data-ready]')).not.toBeNull();
});

it('refreshes on browser permission changes and focus without starting a request', async () => {
  mocks.read.mockResolvedValue('granted');
  await render(boundary('microphone'));
  expect(container.querySelector('[data-ready]')).not.toBeNull();
  act(() => change('denied'));
  expect(container.querySelector('[data-ready]')).toBeNull();
  mocks.read.mockResolvedValue('granted');
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(container.querySelector('[data-ready]')).not.toBeNull();
  expect(mocks.requestMicrophone).not.toHaveBeenCalled();
});

it('refreshes existing inventory when permission is granted externally without starting capture', async () => {
  mocks.read.mockResolvedValue('denied');
  const refresh = vi.fn().mockResolvedValue(undefined);
  await render(boundary('microphone', refresh));
  expect(refresh).not.toHaveBeenCalled();
  await act(async () => change('granted'));
  expect(refresh).toHaveBeenCalledOnce();
  expect(container.querySelector('[data-ready]')).not.toBeNull();
  expect(mocks.requestMicrophone).not.toHaveBeenCalled();
  await act(async () => change('granted'));
  expect(refresh).toHaveBeenCalledOnce();
});

it('does not report recovery for an initially granted permission', async () => {
  mocks.read.mockResolvedValue('granted');
  const recovery = vi.fn().mockResolvedValue(undefined);
  await render(boundary('microphone', recovery));
  expect(container.querySelector('[data-ready]')).not.toBeNull();
  expect(recovery).not.toHaveBeenCalled();
});

it('retains an external grant when inventory refresh fails and refreshes once for an explicit request', async () => {
  const refresh = vi.fn().mockRejectedValue(new Error('inventory unavailable'));
  await render(boundary('camera', refresh));
  await act(async () => change('granted'));
  expect(container.querySelector('[data-ready]')).not.toBeNull();
  expect(refresh).toHaveBeenCalledOnce();
  act(() => change('denied'));
  refresh.mockResolvedValue(undefined);
  mocks.requestCamera.mockImplementationOnce(async () => change('granted'));
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[data-ui="popup.video.camera-request-access"]')
      ?.click()
  );
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(mocks.requestCamera).toHaveBeenCalledOnce();
});

it('retires delayed subscriptions and ignores a request that completes after unmount', async () => {
  let finishSubscription!: (stop: () => void) => void;
  let finishRequest!: () => void;
  mocks.subscribe.mockReturnValue(
    new Promise<() => void>((resolve) => {
      finishSubscription = resolve;
    })
  );
  mocks.requestMicrophone.mockReturnValue(
    new Promise<void>((resolve) => {
      finishRequest = resolve;
    })
  );
  const refresh = vi.fn();
  await render(boundary('microphone', refresh));
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[data-ui="popup.video.microphone-request-access"]')
      ?.click()
  );
  act(() => root.unmount());
  root = createRoot(container);
  await act(async () => {
    finishSubscription(unsubscribe);
    finishRequest();
  });
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(refresh).not.toHaveBeenCalled();
});
