// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Download } from 'lucide-react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { usePermissionRequests } from './requests/use-permission-requests';
import type { PermissionSetter } from './types';
import type { PermissionInfo } from '../permissions-lib';

const {
  applyPermissionStateMock,
  loggerErrorMock,
  requestChromePermissionMock,
  requestMicrophonePermissionMock,
  requestOriginPermissionMock,
} = vi.hoisted(() => ({
  applyPermissionStateMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  requestChromePermissionMock: vi.fn(),
  requestMicrophonePermissionMock: vi.fn(),
  requestOriginPermissionMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', (_importOriginal) => ({
  createLogger: () => ({
    error: loggerErrorMock,
  }),
}));

vi.mock('../permissions-lib', (_importOriginal) => ({
  applyPermissionState: applyPermissionStateMock,
  requestChromePermission: requestChromePermissionMock,
  requestMicrophonePermission: requestMicrophonePermissionMock,
  requestOriginPermission: requestOriginPermissionMock,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let requestPermission: ((permissionId: string) => Promise<boolean>) | null = null;

function Harness({
  permissions,
  setPermissions,
}: {
  permissions: PermissionInfo[];
  setPermissions: PermissionSetter;
}) {
  requestPermission = usePermissionRequests(permissions, setPermissions);
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
  requestPermission = null;
  applyPermissionStateMock.mockImplementation((permissions, matcher, state) =>
    permissions.map((permission: { id: string }) =>
      matcher(permission) ? { ...permission, state } : permission
    )
  );
  requestChromePermissionMock.mockReset();
  requestMicrophonePermissionMock.mockReset();
  requestOriginPermissionMock.mockReset();
  loggerErrorMock.mockReset();
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

it('marks granted permissions when the hook-level request flow succeeds', async () => {
  const permissions: PermissionInfo[] = [
    {
      id: 'downloads',
      icon: Download,
      type: 'chrome',
      chromePermission: 'downloads',
      state: 'prompt',
    },
  ];
  const setPermissions = vi.fn() as unknown as PermissionSetter;

  requestChromePermissionMock.mockResolvedValue(true);

  await renderHarness(permissions, setPermissions);

  await act(async () => {
    await expect(requestPermission?.('downloads')).resolves.toBe(true);
  });

  expect(requestChromePermissionMock).toHaveBeenCalledWith('downloads');
  expect(setPermissions).toHaveBeenCalled();
});
