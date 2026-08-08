// @vitest-environment jsdom

import { act, forwardRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LucideIcon } from 'lucide-react';

const { applyPermissionStateMock, removeOriginPermissionsMock } = vi.hoisted(() => ({
  applyPermissionStateMock: vi.fn(),
  removeOriginPermissionsMock: vi.fn(),
}));

vi.mock('../../permissions-lib', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../permissions-lib')>()),
  applyPermissionState: (...args: unknown[]) => applyPermissionStateMock(...args),
  removeOriginPermissions: (...args: unknown[]) => removeOriginPermissionsMock(...args),
}));

import type { PermissionInfo } from '../../permissions-lib';
import { usePermissionRevokes } from './use-permission-revokes';

const PermissionFixtureIcon: LucideIcon = forwardRef(() => null);

const originPermission: PermissionInfo = {
  icon: PermissionFixtureIcon,
  id: 'origins',
  originPatterns: ['<all_urls>'],
  state: 'granted',
  type: 'origin',
};

let container: HTMLDivElement | null = null;
let currentPermissions: PermissionInfo[] = [];
let latestRevokePermission: ((permissionId: string) => Promise<boolean>) | null = null;
let root: Root | null = null;

function Harness(props: { permissions: PermissionInfo[] }) {
  latestRevokePermission = usePermissionRevokes(props.permissions, (updater) => {
    currentPermissions = typeof updater === 'function' ? updater(currentPermissions) : updater;
  });
  return null;
}

async function renderHarness(permissions: PermissionInfo[]) {
  currentPermissions = permissions;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<Harness permissions={permissions} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  applyPermissionStateMock.mockReset();
  applyPermissionStateMock.mockImplementation((permissions, matcher, state) =>
    permissions.map((permission: PermissionInfo) =>
      matcher(permission) ? { ...permission, state } : permission
    )
  );
  removeOriginPermissionsMock.mockReset();
  removeOriginPermissionsMock.mockResolvedValue(true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  currentPermissions = [];
  latestRevokePermission = null;
  vi.unstubAllGlobals();
});

it('revokes grouped origin permissions and marks the row prompt', async () => {
  await renderHarness([originPermission]);

  await expect(latestRevokePermission?.('origins')).resolves.toBe(true);

  expect(removeOriginPermissionsMock).toHaveBeenCalledWith(['<all_urls>']);
  expect(currentPermissions[0]?.state).toBe('prompt');
});

it('ignores permissions that do not own origin patterns', async () => {
  const { originPatterns: _originPatterns, ...webPermission } = originPermission;
  await renderHarness([{ ...webPermission, type: 'web' }]);

  await expect(latestRevokePermission?.('origins')).resolves.toBe(false);

  expect(removeOriginPermissionsMock).not.toHaveBeenCalled();
  expect(currentPermissions[0]?.state).toBe('granted');
});
