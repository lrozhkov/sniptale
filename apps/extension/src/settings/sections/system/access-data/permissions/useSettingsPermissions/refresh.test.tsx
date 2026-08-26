// @vitest-environment jsdom

import { act } from 'react';
import { Download, Mic } from 'lucide-react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { usePermissionRefresh } from './refresh';
import type { PermissionSetter } from './types';
import type { PermissionInfo } from '../permissions-lib';

const {
  readPermissionsSnapshotMock,
  registerEffectiveFileSchemeAccessMock,
  usePermissionListenersMock,
  usePermissionRequestsMock,
  usePermissionRevokesMock,
} = vi.hoisted(() => ({
  readPermissionsSnapshotMock: vi.fn(),
  registerEffectiveFileSchemeAccessMock: vi.fn(),
  usePermissionListenersMock: vi.fn(),
  usePermissionRequestsMock: vi.fn(() => vi.fn()),
  usePermissionRevokesMock: vi.fn(() => vi.fn()),
}));

vi.mock('./requests/request-actions/request-origin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./requests/request-actions/request-origin')>()),
  registerEffectiveFileSchemeAccess: registerEffectiveFileSchemeAccessMock,
}));

vi.mock('../permissions-lib', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../permissions-lib')>()),
  readPermissionsSnapshot: readPermissionsSnapshotMock,
}));

vi.mock('./listeners', () => ({ usePermissionListeners: usePermissionListenersMock }));
vi.mock('./requests/use-permission-requests', () => ({
  usePermissionRequests: usePermissionRequestsMock,
}));
vi.mock('./requests/use-permission-revokes', () => ({
  usePermissionRevokes: usePermissionRevokesMock,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let refreshPermissions: (() => Promise<void>) | null = null;
let runPermissionRefresh: ((permissions?: PermissionInfo[]) => Promise<void>) | null = null;

function Harness({
  permissions,
  setPermissions,
}: {
  permissions: PermissionInfo[];
  setPermissions: PermissionSetter;
}) {
  runPermissionRefresh = usePermissionRefresh(setPermissions);
  refreshPermissions = () => runPermissionRefresh?.(permissions) ?? Promise.resolve();

  return null;
}

async function renderHarness(permissions: PermissionInfo[], setPermissions: PermissionSetter) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<Harness permissions={permissions} setPermissions={setPermissions} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  refreshPermissions = null;
  runPermissionRefresh = null;
  readPermissionsSnapshotMock.mockReset();
  registerEffectiveFileSchemeAccessMock.mockReset().mockResolvedValue(true);
  usePermissionListenersMock.mockClear();
  usePermissionRequestsMock.mockClear();
  usePermissionRevokesMock.mockClear();
});

it('synchronizes effective local-file access with the background registration owner', async () => {
  const filePermission = {
    id: 'localFiles',
    icon: Mic,
    originPattern: 'file:///',
    state: 'granted',
    type: 'file',
  } satisfies PermissionInfo;
  const setPermissions: PermissionSetter = vi.fn();
  readPermissionsSnapshotMock.mockResolvedValue([filePermission]);

  await renderHarness([filePermission], setPermissions);
  await act(async () => {
    await refreshPermissions?.();
  });

  expect(registerEffectiveFileSchemeAccessMock).toHaveBeenCalledOnce();
  expect(setPermissions).toHaveBeenCalledWith([filePermission]);
});

it('surfaces a failed local-file registration as an error state', async () => {
  const filePermission = {
    id: 'localFiles',
    icon: Mic,
    originPattern: 'file:///',
    state: 'granted',
    type: 'file',
  } satisfies PermissionInfo;
  const setPermissions: PermissionSetter = vi.fn();
  readPermissionsSnapshotMock.mockResolvedValue([filePermission]);
  registerEffectiveFileSchemeAccessMock.mockResolvedValue(false);

  await renderHarness([filePermission], setPermissions);
  await act(async () => {
    await refreshPermissions?.();
  });

  expect(setPermissions).toHaveBeenCalledWith([
    expect.objectContaining({ id: 'localFiles', state: 'error' }),
  ]);
});

it('reconciles a disabled local-file permission without marking it as an error', async () => {
  const filePermission = {
    id: 'localFiles',
    icon: Mic,
    originPattern: 'file:///',
    state: 'prompt',
    type: 'file',
  } satisfies PermissionInfo;
  const setPermissions: PermissionSetter = vi.fn();
  readPermissionsSnapshotMock.mockResolvedValue([filePermission]);
  registerEffectiveFileSchemeAccessMock.mockResolvedValue(false);

  await renderHarness([filePermission], setPermissions);
  await act(async () => {
    await refreshPermissions?.();
  });

  expect(registerEffectiveFileSchemeAccessMock).toHaveBeenCalledOnce();
  expect(setPermissions).toHaveBeenCalledWith([filePermission]);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('refreshes permissions from the current snapshot', async () => {
  const currentPermissions: PermissionInfo[] = [
    {
      id: 'microphone',
      icon: Mic,
      state: 'prompt',
      type: 'web',
    },
  ];
  const nextPermissions: PermissionInfo[] = [
    {
      id: 'downloads',
      icon: Download,
      state: 'granted',
      type: 'chrome',
      chromePermission: 'downloads',
    },
  ];
  const setPermissions: PermissionSetter = vi.fn();

  readPermissionsSnapshotMock.mockResolvedValue(nextPermissions);

  await renderHarness(currentPermissions, setPermissions);

  await act(async () => {
    await refreshPermissions?.();
  });

  expect(readPermissionsSnapshotMock).toHaveBeenCalledWith(currentPermissions);
  expect(setPermissions).toHaveBeenCalledWith(nextPermissions);
});

it('commits only the latest permission refresh when results resolve out of order', async () => {
  const first = createDeferred<PermissionInfo[]>();
  const second = createDeferred<PermissionInfo[]>();
  const firstInput = [
    { id: 'microphone', icon: Mic, state: 'prompt', type: 'web' },
  ] satisfies PermissionInfo[];
  const secondInput = [
    { id: 'microphone', icon: Mic, state: 'granted', type: 'web' },
  ] satisfies PermissionInfo[];
  const setPermissions: PermissionSetter = vi.fn();
  readPermissionsSnapshotMock
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);

  await renderHarness(firstInput, setPermissions);
  const firstRefresh = runPermissionRefresh?.(firstInput);
  const secondRefresh = runPermissionRefresh?.(secondInput);

  second.resolve(secondInput);
  await secondRefresh;
  first.resolve(firstInput);
  await firstRefresh;

  expect(setPermissions).toHaveBeenCalledOnce();
  expect(setPermissions).toHaveBeenCalledWith(secondInput);
});

it('shares the latest-only refresh owner across Settings listeners and manual refresh', async () => {
  const { useSettingsPermissions } = await import('./index');
  let latest: ReturnType<typeof useSettingsPermissions> | null = null;
  readPermissionsSnapshotMock.mockResolvedValue([]);

  function SettingsHarness() {
    latest = useSettingsPermissions();
    return null;
  }

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<SettingsHarness />);
  });
  await act(async () => {
    await latest?.refreshPermissions();
  });

  expect(usePermissionListenersMock).toHaveBeenCalled();
  expect(usePermissionRequestsMock).toHaveBeenCalled();
  expect(usePermissionRevokesMock).toHaveBeenCalled();
  expect(readPermissionsSnapshotMock).toHaveBeenCalled();
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
