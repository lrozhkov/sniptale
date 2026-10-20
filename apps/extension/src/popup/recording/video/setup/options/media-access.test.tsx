// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

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
function boundary(permissionName: 'microphone' | 'camera', onGranted = vi.fn(), enabled = true) {
  return (
    <MediaAccessBoundary
      permissionName={permissionName}
      deviceId="saved-device"
      label={permissionName}
      enabled={enabled}
      onGranted={onGranted}
    >
      <span data-ready>Selected device</span>
    </MediaAccessBoundary>
  );
}
async function openPermissions(permissionName: 'microphone' | 'camera') {
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        `[data-ui="popup.video.${permissionName}-open-permissions"]`
      )
      ?.click()
  );
}

it.each(['microphone', 'camera'] as const)(
  'keeps navigation-only recovery visible for a disabled %s with prompt access',
  async (permissionName) => {
    await render(boundary(permissionName, vi.fn(), false));
    expect(container.querySelector('button')).not.toBeNull();
    await openPermissions(permissionName);
    expect(mocks.openSettings).toHaveBeenCalledWith({
      route: { section: 'access-data', view: 'permissions' },
      requestMediaAccess: permissionName,
    });
    expect(mocks.requestMicrophone).not.toHaveBeenCalled();
    expect(mocks.requestCamera).not.toHaveBeenCalled();
    expect(container.querySelector('[data-ready]')).toBeNull();
  }
);
it('offers only Settings navigation rather than an ineffective popup capture request', async () => {
  await render(boundary('microphone'));
  expect(container.querySelectorAll('button')).toHaveLength(1);
  expect(container.querySelector('[data-ui="popup.video.microphone-request-access"]')).toBeNull();
  expect(container.textContent).toContain('popup.video.mediaPermissionsHelp');
  expect(container.textContent).toContain('popup.video.microphonePermissionRequired');
  await openPermissions('microphone');
  expect(container.querySelector('[data-ready]')).toBeNull();
  expect(mocks.requestMicrophone).not.toHaveBeenCalled();
});
it('preserves a blocked camera selection while navigating to Permissions', async () => {
  mocks.read.mockResolvedValue('denied');
  const refresh = vi.fn();
  await render(boundary('camera', refresh));
  expect(container.textContent).toContain('popup.video.cameraPermissionDenied');
  await openPermissions('camera');
  expect(refresh).not.toHaveBeenCalled();
  expect(mocks.requestCamera).not.toHaveBeenCalled();
  expect(container.querySelector('[data-ready]')).toBeNull();
});
it('keeps disabled devices off after an external grant', async () => {
  mocks.read.mockResolvedValue('denied');
  const refresh = vi.fn().mockResolvedValue(undefined);
  await render(boundary('microphone', refresh, false));
  await act(async () => change('granted'));
  expect(refresh).toHaveBeenCalledOnce();
  expect(container.querySelector('[data-ready]')).toBeNull();
  expect(container.textContent).toBe('');
  expect(mocks.requestMicrophone).not.toHaveBeenCalled();
});
it('keeps disabled unknown access actionable and contains navigation failure with retry', async () => {
  mocks.read.mockResolvedValue('unknown');
  mocks.openSettings.mockRejectedValueOnce(new Error('private failure'));
  await render(boundary('camera', vi.fn(), false));
  await openPermissions('camera');
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    'popup.video.mediaPermissionsNavigationFailed'
  );
  expect(container.textContent).not.toContain('private failure');
  await openPermissions('camera');
  expect(mocks.openSettings).toHaveBeenCalledTimes(2);
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(mocks.requestCamera).not.toHaveBeenCalled();
});
it('prevents duplicate navigation and exposes pending state until completion', async () => {
  let finishNavigation!: () => void;
  mocks.openSettings.mockReturnValue(
    new Promise<void>((resolve) => {
      finishNavigation = resolve;
    })
  );
  await render(boundary('camera'));
  await openPermissions('camera');
  expect(container.querySelector('button')?.disabled).toBe(true);
  expect(container.textContent).toContain('popup.video.mediaOpeningPermissions');
  await openPermissions('camera');
  expect(mocks.openSettings).toHaveBeenCalledOnce();
  await act(async () => finishNavigation());
  expect(container.querySelector('button')?.disabled).toBe(false);
});
it('keeps navigation available even while the initial permission query is unresolved', async () => {
  mocks.read.mockReturnValue(new Promise(() => undefined));
  await render(boundary('camera', vi.fn(), false));
  expect(container.textContent).toContain('popup.video.mediaCheckingAccess');
  await openPermissions('camera');
  expect(mocks.openSettings).toHaveBeenCalledOnce();
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
it('refreshes existing inventory once when permission is granted externally without capture', async () => {
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
it('retains an external grant when advisory inventory refresh fails', async () => {
  const refresh = vi.fn().mockRejectedValue(new Error('inventory unavailable'));
  await render(boundary('camera', refresh));
  await act(async () => change('granted'));
  expect(container.querySelector('[data-ready]')).not.toBeNull();
  expect(refresh).toHaveBeenCalledOnce();
});
it('ignores an older permission query that finishes after a permission change', async () => {
  let finishRead!: (state: string) => void;
  mocks.read.mockReturnValue(
    new Promise<string>((resolve) => {
      finishRead = resolve;
    })
  );
  await render(boundary('camera'));
  await act(async () => change('granted'));
  await act(async () => finishRead('denied'));
  expect(container.querySelector('[data-ready]')).not.toBeNull();
});
it('retires delayed subscriptions and ignores navigation that completes after unmount', async () => {
  let finishSubscription!: (stop: () => void) => void;
  let finishNavigation!: () => void;
  mocks.subscribe.mockReturnValue(
    new Promise<() => void>((resolve) => {
      finishSubscription = resolve;
    })
  );
  mocks.openSettings.mockReturnValue(
    new Promise<void>((_resolve, reject) => {
      finishNavigation = () => reject(new Error('navigation failed'));
    })
  );
  const refresh = vi.fn();
  await render(boundary('microphone', refresh));
  await openPermissions('microphone');
  act(() => root.unmount());
  root = createRoot(container);
  await act(async () => {
    finishSubscription(unsubscribe);
    finishNavigation();
    window.dispatchEvent(new Event('focus'));
  });
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(refresh).not.toHaveBeenCalled();
  expect(mocks.read).toHaveBeenCalledOnce();
});
