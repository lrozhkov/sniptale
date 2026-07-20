// @vitest-environment jsdom

import { act } from 'react';
import { Download, Mic } from 'lucide-react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { usePermissionRefresh } from './refresh';
import type { PermissionSetter } from './types';
import type { PermissionInfo } from '../permissions-lib';

const { readPermissionsSnapshotMock } = vi.hoisted(() => ({
  readPermissionsSnapshotMock: vi.fn(),
}));

vi.mock('../permissions-lib', (_importOriginal) => ({
  readPermissionsSnapshot: readPermissionsSnapshotMock,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let refreshPermissions: (() => Promise<void>) | null = null;

function Harness({
  permissions,
  setPermissions,
}: {
  permissions: PermissionInfo[];
  setPermissions: PermissionSetter;
}) {
  refreshPermissions = usePermissionRefresh(permissions, setPermissions);

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
  readPermissionsSnapshotMock.mockReset();
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
  const setPermissions = vi.fn() as unknown as PermissionSetter;

  readPermissionsSnapshotMock.mockResolvedValue(nextPermissions);

  await renderHarness(currentPermissions, setPermissions);

  await act(async () => {
    await refreshPermissions?.();
  });

  expect(readPermissionsSnapshotMock).toHaveBeenCalledWith(currentPermissions);
  expect(setPermissions).toHaveBeenCalledWith(nextPermissions);
});
