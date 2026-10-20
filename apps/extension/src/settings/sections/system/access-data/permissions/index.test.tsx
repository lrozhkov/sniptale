// @vitest-environment jsdom

import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

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
    onViewChange: expect.any(Function),
    view: 'optional',
  });
  expect(container?.querySelector('[data-testid="permissions-section-content"]')).not.toBeNull();
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
