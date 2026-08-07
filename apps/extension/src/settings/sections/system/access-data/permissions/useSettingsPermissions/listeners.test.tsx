// @vitest-environment jsdom

import { act } from 'react';
import { Mic } from 'lucide-react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { usePermissionListeners } from './listeners';
import type { PermissionSetter } from './types';
import type { PermissionInfo } from '../permissions-lib';

const {
  readPermissionsSnapshotMock,
  subscribeToPermissionChangesMock,
  syncWebPermissionStatusMock,
} = vi.hoisted(() => ({
  readPermissionsSnapshotMock: vi.fn(),
  subscribeToPermissionChangesMock: vi.fn(),
  syncWebPermissionStatusMock: vi.fn(),
}));

vi.mock('../permissions-lib', (_importOriginal) => ({
  readPermissionsSnapshot: readPermissionsSnapshotMock,
  subscribeToPermissionChanges: subscribeToPermissionChangesMock,
  syncWebPermissionStatus: syncWebPermissionStatusMock,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let permissionChangeListener: (() => void) | null = null;
const microphoneStatus = { onchange: null };
const cameraStatus = { onchange: null };

function createMicrophoneSnapshot(state: 'prompt' | 'granted'): PermissionInfo[] {
  return [
    {
      id: 'microphone',
      icon: Mic,
      state,
      type: 'web',
    },
  ];
}

function Harness({ setPermissions }: { setPermissions: PermissionSetter }) {
  usePermissionListeners(setPermissions);

  return null;
}

async function renderHarness(setPermissions: PermissionSetter) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<Harness setPermissions={setPermissions} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  permissionChangeListener = null;
  readPermissionsSnapshotMock.mockReset();
  syncWebPermissionStatusMock.mockReset();
  subscribeToPermissionChangesMock.mockImplementation((listener: () => void) => {
    permissionChangeListener = listener;
    return vi.fn();
  });
  syncWebPermissionStatusMock.mockImplementation((_id: string, status: { onchange: unknown }) => {
    status.onchange = vi.fn();
  });

  Object.defineProperty(globalThis.navigator, 'permissions', {
    configurable: true,
    value: {
      query: vi.fn(async ({ name }: { name: PermissionName }) =>
        name === 'camera' ? cameraStatus : microphoneStatus
      ),
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
  vi.unstubAllGlobals();
});

it('subscribes to permission changes and clears microphone listeners on cleanup', async () => {
  const setPermissions = vi.fn() as unknown as PermissionSetter;
  const snapshot = createMicrophoneSnapshot('prompt');
  const updatedSnapshot = createMicrophoneSnapshot('granted');
  readPermissionsSnapshotMock
    .mockResolvedValueOnce(snapshot)
    .mockResolvedValueOnce(updatedSnapshot);

  await renderHarness(setPermissions);

  await act(async () => {
    await Promise.resolve();
  });

  expect(readPermissionsSnapshotMock).toHaveBeenCalledTimes(1);
  expect(readPermissionsSnapshotMock).toHaveBeenCalledWith();
  expect(setPermissions).toHaveBeenCalledWith(snapshot);
  expect(subscribeToPermissionChangesMock).toHaveBeenCalledTimes(1);
  expect(syncWebPermissionStatusMock).toHaveBeenCalledWith(
    'microphone',
    microphoneStatus,
    setPermissions
  );

  await act(async () => {
    permissionChangeListener?.();
    await Promise.resolve();
  });

  expect(readPermissionsSnapshotMock).toHaveBeenCalledTimes(2);
  expect(setPermissions).toHaveBeenLastCalledWith(updatedSnapshot);
  expect(syncWebPermissionStatusMock).toHaveBeenCalledWith('camera', cameraStatus, setPermissions);

  await act(async () => {
    root?.unmount();
  });

  expect(microphoneStatus.onchange).toBeNull();
  expect(cameraStatus.onchange).toBeNull();
});

it('handles microphone permission query failures without attaching a status listener', async () => {
  const setPermissions = vi.fn() as unknown as PermissionSetter;
  const queryMock = vi.fn(async () => {
    throw new Error('permission api unavailable');
  });
  readPermissionsSnapshotMock.mockResolvedValue([]);

  Object.defineProperty(globalThis.navigator, 'permissions', {
    configurable: true,
    value: {
      query: queryMock,
    },
  });

  await renderHarness(setPermissions);

  await act(async () => {
    await Promise.resolve();
  });

  expect(queryMock).toHaveBeenCalledTimes(2);
  expect(readPermissionsSnapshotMock).toHaveBeenCalledWith();
  expect(syncWebPermissionStatusMock).not.toHaveBeenCalled();

  await act(async () => {
    root?.unmount();
  });

  expect(readPermissionsSnapshotMock).toHaveBeenCalledTimes(1);
});
