// @vitest-environment jsdom

import { act } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PermissionInfo } from '../../permissions-lib';
import { usePermissionRequests } from './use-permission-requests';

const { loggerErrorMock } = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', (_importOriginal) => ({
  createLogger: () => ({
    error: loggerErrorMock,
  }),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestRequest: ((permissionId: string) => Promise<boolean>) | null = null;

const cameraPermission = {
  id: 'camera',
  state: 'prompt',
  type: 'web',
} as PermissionInfo;

function HookHarness({
  permissions,
  setPermissions,
}: {
  permissions: PermissionInfo[];
  setPermissions: Dispatch<SetStateAction<PermissionInfo[]>>;
}) {
  latestRequest = usePermissionRequests(permissions, setPermissions);
  return null;
}

async function renderHarness(
  permissions: PermissionInfo[],
  setPermissions: Dispatch<SetStateAction<PermissionInfo[]>>
): Promise<void> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<HookHarness permissions={permissions} setPermissions={setPermissions} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  loggerErrorMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestRequest = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('usePermissionRequests', () => {
  it('returns false for unknown permissions', async () => {
    await renderHarness([cameraPermission], vi.fn());

    await expect(latestRequest?.('missing')).resolves.toBe(false);
  });

  it('requests camera permissions through the typed request action', async () => {
    const stop = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop }],
        }),
      },
    });
    await renderHarness([cameraPermission], vi.fn());

    await expect(latestRequest?.('camera')).resolves.toBe(true);

    expect(stop).toHaveBeenCalledOnce();
  });

  it('logs request failures and returns false', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockImplementation(() => {
          throw new Error('camera failed');
        }),
      },
    });
    await renderHarness(
      [cameraPermission],
      vi.fn(() => {
        throw new Error('state failed');
      })
    );

    await expect(latestRequest?.('camera')).resolves.toBe(false);

    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Failed to request settings permission',
      expect.any(Error)
    );
  });
});
