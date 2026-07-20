// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSettingsPermissions } from './useSettingsPermissions';

const {
  applyPermissionStateMock,
  browserPermissionsContainsMock,
  browserPermissionsRemoveMock,
  loggerErrorMock,
  readPermissionsSnapshotMock,
  requestChromePermissionMock,
  requestMicrophonePermissionMock,
  requestOriginPermissionMock,
  requestOriginPermissionsMock,
  sendRuntimeMessageMock,
  subscribeToPermissionChangesMock,
  syncMicrophonePermissionStatusMock,
} = vi.hoisted(() => ({
  applyPermissionStateMock: vi.fn(),
  browserPermissionsContainsMock: vi.fn(),
  browserPermissionsRemoveMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  readPermissionsSnapshotMock: vi.fn(),
  requestChromePermissionMock: vi.fn(),
  requestMicrophonePermissionMock: vi.fn(),
  requestOriginPermissionMock: vi.fn(),
  requestOriginPermissionsMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  subscribeToPermissionChangesMock: vi.fn(),
  syncMicrophonePermissionStatusMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', (_importOriginal) => ({
  createLogger: () => ({
    error: loggerErrorMock,
  }),
}));

vi.mock('@sniptale/platform/browser/permissions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/permissions')>()),
  getMissingOriginPermissions: async (origins: readonly string[]) => {
    const checks = await Promise.all(
      origins.map(async (origin) => ({
        granted: await browserPermissionsContainsMock({ origins: [origin] }),
        origin,
      }))
    );
    return checks.filter((check) => !check.granted).map((check) => check.origin);
  },
  browserPermissions: {
    contains: browserPermissionsContainsMock,
    remove: browserPermissionsRemoveMock,
  },
}));

vi.mock('../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging')>()),
  createRuntimeMessagingTransport: () => ({
    sendRuntimeMessage: sendRuntimeMessageMock,
  }),
}));

vi.mock('./permissions-lib', (_importOriginal) => {
  const basePermissions = [
    {
      id: 'origins',
      icon: () => null,
      state: 'unknown',
      type: 'origin',
      originPatterns: ['<all_urls>'],
    },
    {
      id: 'microphone',
      icon: () => null,
      state: 'unknown',
      type: 'web',
    },
  ];

  return {
    initialPermissions: basePermissions,
    applyPermissionState: applyPermissionStateMock,
    readPermissionsSnapshot: readPermissionsSnapshotMock,
    requestChromePermission: requestChromePermissionMock,
    requestMicrophonePermission: requestMicrophonePermissionMock,
    requestOriginPermission: requestOriginPermissionMock,
    requestOriginPermissions: requestOriginPermissionsMock,
    subscribeToPermissionChanges: subscribeToPermissionChangesMock,
    syncMicrophonePermissionStatus: syncMicrophonePermissionStatusMock,
  };
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useSettingsPermissions> | null = null;
let permissionChangeListener: (() => void) | null = null;

function PermissionsHarness() {
  latestState = useSettingsPermissions();
  return null;
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<PermissionsHarness />);
  });
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  permissionChangeListener = null;

  applyPermissionStateMock.mockImplementation((permissions, matcher, state) =>
    permissions.map((permission: { id: string }) =>
      matcher(permission) ? { ...permission, state } : permission
    )
  );
  readPermissionsSnapshotMock.mockReset();
  requestChromePermissionMock.mockReset();
  requestMicrophonePermissionMock.mockReset();
  requestOriginPermissionMock.mockReset();
  requestOriginPermissionsMock.mockReset();
  browserPermissionsContainsMock.mockReset().mockResolvedValue(false);
  browserPermissionsRemoveMock.mockReset().mockResolvedValue(true);
  sendRuntimeMessageMock.mockReset();
  sendRuntimeMessageMock.mockResolvedValue({ success: true });
  subscribeToPermissionChangesMock.mockImplementation((listener: () => void) => {
    permissionChangeListener = listener;
    return vi.fn();
  });
  syncMicrophonePermissionStatusMock.mockReset();

  const microphoneStatus = { state: 'prompt', onchange: null };
  Object.defineProperty(globalThis.navigator, 'permissions', {
    configurable: true,
    value: {
      query: vi.fn(async () => microphoneStatus),
    },
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestState = null;
  vi.unstubAllGlobals();
});

function createPermissionSnapshot(originState: 'prompt' | 'granted') {
  return [
    {
      id: 'origins',
      icon: () => null,
      state: originState,
      type: 'origin',
      originPatterns: ['<all_urls>'],
    },
    {
      id: 'microphone',
      icon: () => null,
      state: 'prompt',
      type: 'web',
    },
    {
      id: 'downloads',
      icon: () => null,
      state: 'prompt',
      type: 'chrome',
      chromePermission: 'downloads',
    },
  ];
}

async function verifySettingsPermissionsFlow() {
  const initialSnapshot = createPermissionSnapshot('prompt');
  const refreshedSnapshot = createPermissionSnapshot('granted');

  readPermissionsSnapshotMock
    .mockResolvedValueOnce(initialSnapshot)
    .mockResolvedValueOnce(refreshedSnapshot)
    .mockResolvedValueOnce(refreshedSnapshot);
  requestOriginPermissionsMock.mockResolvedValue(true);

  await renderHarness();
  await flushEffects();

  expect(latestState?.permissions).toEqual(initialSnapshot);

  await act(async () => {
    const granted = await latestState?.requestPermission('origins');
    expect(granted).toBe(true);
  });

  expect(requestOriginPermissionsMock).toHaveBeenCalledWith(['<all_urls>']);
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    operation: 'register-granted-all-sites',
    type: 'PAGE_ACCESS',
  });
  expect(latestState?.permissions[0]?.state).toBe('granted');

  await act(async () => {
    await latestState?.refreshPermissions();
  });

  expect(latestState?.permissions).toEqual(refreshedSnapshot);

  await act(async () => {
    permissionChangeListener?.();
    await Promise.resolve();
  });

  expect(readPermissionsSnapshotMock).toHaveBeenCalledTimes(3);
  expect(subscribeToPermissionChangesMock).toHaveBeenCalledTimes(1);
}

describe('useSettingsPermissions', () => {
  it(
    'loads, refreshes, and updates permission state after origin grant',
    verifySettingsPermissionsFlow
  );

  it('returns false when the requested permission id is missing', async () => {
    readPermissionsSnapshotMock.mockResolvedValue(createPermissionSnapshot('prompt'));

    await renderHarness();
    await flushEffects();

    await act(async () => {
      await expect(latestState?.requestPermission('missing')).resolves.toBe(false);
    });

    expect(requestOriginPermissionMock).not.toHaveBeenCalled();
    expect(requestOriginPermissionsMock).not.toHaveBeenCalled();
    expect(requestMicrophonePermissionMock).not.toHaveBeenCalled();
    expect(requestChromePermissionMock).not.toHaveBeenCalled();
  });

  it('requests microphone permission and updates the microphone state', async () => {
    readPermissionsSnapshotMock.mockResolvedValue(createPermissionSnapshot('prompt'));
    requestMicrophonePermissionMock.mockResolvedValue('granted');

    await renderHarness();
    await flushEffects();

    await act(async () => {
      await expect(latestState?.requestPermission('microphone')).resolves.toBe(true);
    });

    expect(requestMicrophonePermissionMock).toHaveBeenCalledTimes(1);
    expect(latestState?.permissions[1]?.state).toBe('granted');
  });
});

describe('useSettingsPermissions chrome permissions', () => {
  it('requests chrome permission and marks the matching permission as granted', async () => {
    readPermissionsSnapshotMock.mockResolvedValue(createPermissionSnapshot('prompt'));
    requestChromePermissionMock.mockResolvedValue(true);

    await renderHarness();
    await flushEffects();

    await act(async () => {
      await expect(latestState?.requestPermission('downloads')).resolves.toBe(true);
    });

    expect(requestChromePermissionMock).toHaveBeenCalledWith('downloads');
    expect(latestState?.permissions[2]?.state).toBe('granted');
  });
});
