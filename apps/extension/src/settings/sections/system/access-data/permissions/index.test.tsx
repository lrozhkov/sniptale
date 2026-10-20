// @vitest-environment jsdom

import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';

const { mutateVideoSettingsSpy } = vi.hoisted(() => ({ mutateVideoSettingsSpy: vi.fn() }));

vi.mock('../../../../../composition/persistence/capture-settings', () => ({
  mutateVideoSettings: mutateVideoSettingsSpy,
}));

const { permissionsSectionContentSpy, useSettingsPermissionsSpy, openMediaSettingsSpy } =
  vi.hoisted(() => ({
    permissionsSectionContentSpy: vi.fn(),
    useSettingsPermissionsSpy: vi.fn(),
    openMediaSettingsSpy: vi.fn(),
  }));

vi.mock('../../../../../platform/navigation/extension-pages', () => ({
  openMediaPermissionSettingsPage: openMediaSettingsSpy,
  SETTINGS_MEDIA_ACCESS_QUERY_PARAM: 'requestMediaAccess',
}));

vi.mock('./content', () => ({
  PermissionsSectionContent: (props: unknown) => {
    permissionsSectionContentSpy(props);
    return <div data-testid="permissions-section-content" />;
  },
}));

vi.mock('./useSettingsPermissions', () => ({
  useSettingsPermissions: () => useSettingsPermissionsSpy(),
}));

import { PermissionsSection } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderSection(strictMode = false) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(
      strictMode ? (
        <StrictMode>
          <PermissionsSection />
        </StrictMode>
      ) : (
        <PermissionsSection />
      )
    );
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  permissionsSectionContentSpy.mockReset();
  useSettingsPermissionsSpy.mockReset();
  openMediaSettingsSpy.mockReset().mockResolvedValue(undefined);
  mutateVideoSettingsSpy
    .mockReset()
    .mockImplementation(async (mutation) => mutation({ ...DEFAULT_VIDEO_SETTINGS }));
  window.history.replaceState(null, '', '/?section=access-data&view=permissions');
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});

it.each(['microphone', 'camera'] as const)(
  'consumes the %s intent before requesting once across StrictMode, rerender and reload',
  async (permission) => {
    window.history.replaceState(
      { retained: true },
      '',
      `?section=access-data&view=permissions&keep=yes&requestMediaAccess=${permission}#anchor`
    );
    const requestPermission = vi.fn(async () => {
      expect(new URL(window.location.href).searchParams.has('requestMediaAccess')).toBe(false);
      return false;
    });
    useSettingsPermissionsSpy.mockReturnValue({ permissions: [], requestPermission });
    await renderSection(true);
    expect(requestPermission).toHaveBeenCalledExactlyOnceWith(permission);
    expect(window.history.state).toEqual({ retained: true });
    expect(new URL(window.location.href).searchParams.get('keep')).toBe('yes');
    expect(window.location.hash).toBe('#anchor');
    await renderSection(true);
    act(() => root?.unmount());
    root = null;
    container?.remove();
    container = null;
    await renderSection();
    expect(requestPermission).toHaveBeenCalledTimes(1);
  }
);

it.each([
  '',
  '?requestMediaAccess=invalid',
  '?requestMediaAccess=Camera',
  '?requestMediaAccess=camera&requestMediaAccess=microphone',
  '?requestMediaAccess=microphone&requestMediaAccess=microphone',
])('does not acquire devices for a normal or invalid visit: %s', async (search) => {
  window.history.replaceState(null, '', `/${search}`);
  const requestPermission = vi.fn();
  useSettingsPermissionsSpy.mockReturnValue({ permissions: [], requestPermission });
  await renderSection(true);
  expect(requestPermission).not.toHaveBeenCalled();
  expect(new URL(window.location.href).searchParams.has('requestMediaAccess')).toBe(false);
});

it('defers the consumed intent until the page is visible and focused', async () => {
  const visible = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  const focused = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
  window.history.replaceState(null, '', '?requestMediaAccess=camera');
  const requestPermission = vi.fn(async () => false);
  useSettingsPermissionsSpy.mockReturnValue({ permissions: [], requestPermission });
  await renderSection(true);
  expect(new URL(window.location.href).searchParams.has('requestMediaAccess')).toBe(false);
  act(() => window.dispatchEvent(new Event('focus')));
  expect(requestPermission).not.toHaveBeenCalled();
  visible.mockReturnValue('visible');
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(requestPermission).not.toHaveBeenCalled();
  focused.mockReturnValue(true);
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(requestPermission).toHaveBeenCalledExactlyOnceWith('camera');
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(requestPermission).toHaveBeenCalledTimes(1);
});

it('cancels an unfocused pending intent when the Permissions page unmounts', async () => {
  const focused = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
  window.history.replaceState(null, '', '?requestMediaAccess=microphone');
  const requestPermission = vi.fn();
  useSettingsPermissionsSpy.mockReturnValue({ permissions: [], requestPermission });
  await renderSection();
  act(() => root?.unmount());
  root = null;
  focused.mockReturnValue(true);
  act(() => window.dispatchEvent(new Event('focus')));
  expect(requestPermission).not.toHaveBeenCalled();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('forwards permissions state and actions into the permissions content shell', async () => {
  const sectionState = {
    permissions: [],
    refreshPermissions: vi.fn(async () => undefined),
    requestPermission: vi.fn(async () => true),
  };

  useSettingsPermissionsSpy.mockReturnValue(sectionState);

  await renderSection();

  expect(permissionsSectionContentSpy).toHaveBeenCalledWith({
    permissions: sectionState.permissions,
    onRefresh: sectionState.refreshPermissions,
    onRequestPermission: sectionState.requestPermission,
    onRevokePermission: undefined,
    onOpenMediaSettings: expect.any(Function),
    mediaNavigationFailed: false,
    mediaEnableFailed: false,
    onViewChange: expect.any(Function),
    view: 'optional',
  });
  expect(container?.querySelector('[data-testid="permissions-section-content"]')).not.toBeNull();
});

function deferredResult<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

it.each([
  ['microphone', 'microphoneEnabled'],
  ['camera', 'webcamEnabled'],
] as const)(
  'enables only the granted %s preference once across StrictMode and reload',
  async (permission, enabledKey) => {
    window.history.replaceState(null, '', `?requestMediaAccess=${permission}`);
    const current = {
      ...DEFAULT_VIDEO_SETTINGS,
      microphoneEnabled: false,
      webcamEnabled: false,
      microphoneDeviceId: 'remembered-mic',
      webcamDeviceId: 'remembered-camera',
      warnWithoutMicrophone: false,
    };
    mutateVideoSettingsSpy.mockImplementation(async (mutation) => {
      expect(mutation(current)).toEqual({ ...current, [enabledKey]: true });
      return mutation(current);
    });
    const requestPermission = vi.fn(async () => true);
    useSettingsPermissionsSpy.mockReturnValue({ permissions: [], requestPermission });
    await renderSection(true);
    expect(mutateVideoSettingsSpy).toHaveBeenCalledTimes(1);
    await renderSection(true);
    act(() => root?.unmount());
    root = null;
    container?.remove();
    container = null;
    await renderSection();
    expect(mutateVideoSettingsSpy).toHaveBeenCalledTimes(1);
  }
);

it('does not enable after refusal, request failure, or a later manual grant', async () => {
  window.history.replaceState(null, '', '?requestMediaAccess=microphone');
  const requestPermission = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
  useSettingsPermissionsSpy.mockReturnValue({ permissions: [], requestPermission });
  await renderSection();
  await act(async () =>
    permissionsSectionContentSpy.mock.lastCall?.[0].onRequestPermission('microphone')
  );
  expect(mutateVideoSettingsSpy).not.toHaveBeenCalled();
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  window.history.replaceState(null, '', '?requestMediaAccess=camera');
  requestPermission.mockRejectedValueOnce(new Error('request failed'));
  await renderSection();
  expect(mutateVideoSettingsSpy).not.toHaveBeenCalled();
});

it('never enables on a plain Settings manual grant', async () => {
  const requestPermission = vi.fn(async () => true);
  useSettingsPermissionsSpy.mockReturnValue({ permissions: [], requestPermission });
  await renderSection();
  await act(async () =>
    permissionsSectionContentSpy.mock.lastCall?.[0].onRequestPermission('camera')
  );
  expect(mutateVideoSettingsSpy).not.toHaveBeenCalled();
});

it('permits a fresh targeted enable after a refused attempt', async () => {
  window.history.replaceState(null, '', '?requestMediaAccess=microphone');
  const requestPermission = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
  useSettingsPermissionsSpy.mockReturnValue({ permissions: [], requestPermission });
  await renderSection();
  expect(mutateVideoSettingsSpy).not.toHaveBeenCalled();
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(requestPermission).toHaveBeenCalledTimes(1);
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  window.history.replaceState(null, '', '?requestMediaAccess=microphone');
  await renderSection();
  expect(requestPermission).toHaveBeenCalledTimes(2);
  expect(mutateVideoSettingsSpy).toHaveBeenCalledTimes(1);
});

it('does not write when Settings closes before the actual grant', async () => {
  window.history.replaceState(null, '', '?requestMediaAccess=microphone');
  const grant = deferredResult<boolean>();
  useSettingsPermissionsSpy.mockReturnValue({
    permissions: [],
    requestPermission: () => grant.promise,
  });
  await renderSection();
  act(() => root?.unmount());
  root = null;
  await act(async () => grant.resolve(true));
  expect(mutateVideoSettingsSpy).not.toHaveBeenCalled();
});

it('rejects a queued enable before writing when Settings closes', async () => {
  window.history.replaceState(null, '', '?requestMediaAccess=camera');
  const lock = deferredResult<void>();
  const write = vi.fn();
  mutateVideoSettingsSpy.mockImplementation(async (mutation) => {
    await lock.promise;
    const next = mutation(DEFAULT_VIDEO_SETTINGS);
    write(next);
    return next;
  });
  useSettingsPermissionsSpy.mockReturnValue({
    permissions: [],
    requestPermission: async () => true,
  });
  await renderSection();
  expect(mutateVideoSettingsSpy).toHaveBeenCalledTimes(1);
  act(() => root?.unmount());
  root = null;
  await act(async () => lock.resolve());
  expect(write).not.toHaveBeenCalled();
});

it('applies the granted field to the recreated current settings root', async () => {
  window.history.replaceState(null, '', '?requestMediaAccess=microphone');
  const grant = deferredResult<boolean>();
  let current: VideoRecordingSettings = {
    ...DEFAULT_VIDEO_SETTINGS,
    microphoneDeviceId: 'old-mic',
  };
  mutateVideoSettingsSpy.mockImplementation(async (mutation) => {
    current = mutation(current);
    return current;
  });
  useSettingsPermissionsSpy.mockReturnValue({
    permissions: [],
    requestPermission: () => grant.promise,
  });
  await renderSection();
  current = {
    ...DEFAULT_VIDEO_SETTINGS,
    microphoneEnabled: false,
    webcamEnabled: false,
    microphoneDeviceId: 'restored-mic',
    webcamDeviceId: 'restored-camera',
    warnWithoutMicrophone: false,
  };
  const recreated = current;
  await act(async () => grant.resolve(true));
  expect(current).toEqual({ ...recreated, microphoneEnabled: true });
});

it('shows enable write failure without replay and permits a fresh targeted retry', async () => {
  window.history.replaceState(null, '', '?requestMediaAccess=camera');
  mutateVideoSettingsSpy.mockRejectedValueOnce(new Error('storage failed'));
  const requestPermission = vi.fn(async () => true);
  useSettingsPermissionsSpy.mockReturnValue({ permissions: [], requestPermission });
  await renderSection();
  expect(permissionsSectionContentSpy.mock.lastCall?.[0].mediaEnableFailed).toBe(true);
  await renderSection();
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(mutateVideoSettingsSpy).toHaveBeenCalledTimes(1);
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  window.history.replaceState(null, '', '?requestMediaAccess=camera');
  await renderSection();
  expect(mutateVideoSettingsSpy).toHaveBeenCalledTimes(2);
  expect(permissionsSectionContentSpy.mock.lastCall?.[0].mediaEnableFailed).toBe(false);
});

it('opens only the requested native settings destination and exposes a retryable navigation failure', async () => {
  useSettingsPermissionsSpy.mockReturnValue({
    permissions: [],
    refreshPermissions: vi.fn(),
    requestPermission: vi.fn(),
  });
  await renderSection();
  expect(openMediaSettingsSpy).not.toHaveBeenCalled();
  const error = new Error('navigation failed');
  openMediaSettingsSpy.mockRejectedValueOnce(error);
  await act(async () => {
    const props = permissionsSectionContentSpy.mock.lastCall?.[0];
    props.onOpenMediaSettings('microphone');
  });
  expect(openMediaSettingsSpy).toHaveBeenCalledExactlyOnceWith('microphone');
  expect(permissionsSectionContentSpy.mock.lastCall?.[0].mediaNavigationFailed).toBe(true);
  await act(async () => {
    permissionsSectionContentSpy.mock.lastCall?.[0].onOpenMediaSettings('camera');
  });
  expect(openMediaSettingsSpy).toHaveBeenLastCalledWith('camera');
  expect(permissionsSectionContentSpy.mock.lastCall?.[0].mediaNavigationFailed).toBe(false);
});

it('does not publish a failed browser navigation after the permission section unmounts', async () => {
  let rejectNavigation: ((error: Error) => void) | undefined;
  openMediaSettingsSpy.mockImplementation(
    () =>
      new Promise<void>((_resolve, reject) => {
        rejectNavigation = reject;
      })
  );
  useSettingsPermissionsSpy.mockReturnValue({
    permissions: [],
    refreshPermissions: vi.fn(),
    requestPermission: vi.fn(),
  });
  await renderSection();
  await act(async () => {
    permissionsSectionContentSpy.mock.lastCall?.[0].onOpenMediaSettings('camera');
  });
  act(() => root?.unmount());
  root = null;
  const calls = permissionsSectionContentSpy.mock.calls.length;
  await act(async () => rejectNavigation?.(new Error('closed')));
  expect(permissionsSectionContentSpy).toHaveBeenCalledTimes(calls);
});
