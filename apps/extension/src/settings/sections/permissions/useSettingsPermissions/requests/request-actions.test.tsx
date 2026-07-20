// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { usePermissionRequestActions } from './request-actions/use-permission-request-actions';
import type { PermissionSetter } from '../types';
import type { PermissionInfo } from '../../permissions-lib';

const {
  applyPermissionStateMock,
  requestChromePermissionMock,
  requestMicrophonePermissionMock,
  requestOriginPermissionMock,
} = vi.hoisted(() => ({
  applyPermissionStateMock: vi.fn(),
  requestChromePermissionMock: vi.fn(),
  requestMicrophonePermissionMock: vi.fn(),
  requestOriginPermissionMock: vi.fn(),
}));

vi.mock('../../permissions-lib', (_importOriginal) => ({
  applyPermissionState: applyPermissionStateMock,
  requestChromePermission: requestChromePermissionMock,
  requestMicrophonePermission: requestMicrophonePermissionMock,
  requestOriginPermission: requestOriginPermissionMock,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let actions: ReturnType<typeof usePermissionRequestActions> | null = null;

function Harness({ setPermissions }: { setPermissions: PermissionSetter }) {
  actions = usePermissionRequestActions(setPermissions);
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
  actions = null;
  applyPermissionStateMock.mockImplementation((permissions, matcher, state) =>
    permissions.map((permission: { id: string }) =>
      matcher(permission) ? { ...permission, state } : permission
    )
  );
  requestChromePermissionMock.mockReset();
  requestMicrophonePermissionMock.mockReset();
  requestOriginPermissionMock.mockReset();
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

it('does not mark chrome or origin permissions as granted when the browser request is denied', async () => {
  const setPermissions = vi.fn() as unknown as PermissionSetter;
  const chromePermission = {
    id: 'downloads',
    chromePermission: 'downloads',
    type: 'chrome',
  } as PermissionInfo;
  const originPermission = {
    id: 'origins',
    originPattern: '<all_urls>',
    type: 'origin',
  } as PermissionInfo;

  requestChromePermissionMock.mockResolvedValue(false);
  requestOriginPermissionMock.mockResolvedValue(false);

  await renderHarness(setPermissions);

  await act(async () => {
    await expect(actions?.requestChrome(chromePermission)).resolves.toBe(false);
    await expect(actions?.requestOrigin(originPermission)).resolves.toBe(false);
  });

  expect(setPermissions).not.toHaveBeenCalled();
});

it('returns false when microphone permission is not granted', async () => {
  const setPermissions = vi.fn() as unknown as PermissionSetter;

  requestMicrophonePermissionMock.mockResolvedValue('denied');

  await renderHarness(setPermissions);

  await act(async () => {
    await expect(actions?.requestMicrophone()).resolves.toBe(false);
  });

  expect(setPermissions).toHaveBeenCalledOnce();
});

it('marks origin permissions as granted when the browser request succeeds', async () => {
  const setPermissions = vi.fn() as unknown as PermissionSetter;
  const originPermission = {
    id: 'origins',
    originPattern: '<all_urls>',
    type: 'origin',
  } as PermissionInfo;

  requestOriginPermissionMock.mockResolvedValue(true);

  await renderHarness(setPermissions);

  await act(async () => {
    await expect(actions?.requestOrigin(originPermission)).resolves.toBe(true);
  });

  expect(setPermissions).toHaveBeenCalledOnce();
});
