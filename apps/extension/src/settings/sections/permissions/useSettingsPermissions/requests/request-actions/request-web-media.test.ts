import { beforeEach, expect, it, vi } from 'vitest';

import { createRequestCameraAction } from './request-camera';
import { createRequestOriginAction } from './request-origin';
import { createRequestWebMediaAction } from './request-web-media';
import { initialPermissions } from '../../../permissions-lib';

const {
  applyPermissionStateMock,
  requestCameraPermissionMock,
  requestMicrophonePermissionMock,
  requestOriginPermissionMock,
  requestOriginPermissionsMock,
  browserPermissionsContainsMock,
  browserPermissionsRemoveMock,
  runtimeSendMessageMock,
} = vi.hoisted(() => ({
  applyPermissionStateMock: vi.fn(),
  requestCameraPermissionMock: vi.fn(),
  requestMicrophonePermissionMock: vi.fn(),
  requestOriginPermissionMock: vi.fn(),
  requestOriginPermissionsMock: vi.fn(),
  browserPermissionsContainsMock: vi.fn(),
  browserPermissionsRemoveMock: vi.fn(),
  runtimeSendMessageMock: vi.fn(),
}));

vi.mock('../../../permissions-lib', (_importOriginal) => ({
  initialPermissions: [
    {
      icon: vi.fn(),
      id: 'origins',
      originPatterns: ['<all_urls>'],
      state: 'prompt',
      type: 'origin',
    },
    { icon: vi.fn(), id: 'camera', state: 'prompt', type: 'web' },
    { icon: vi.fn(), id: 'microphone', state: 'prompt', type: 'web' },
  ],
  applyPermissionState: applyPermissionStateMock,
  requestCameraPermission: requestCameraPermissionMock,
  requestMicrophonePermission: requestMicrophonePermissionMock,
  requestOriginPermission: requestOriginPermissionMock,
  requestOriginPermissions: requestOriginPermissionsMock,
}));

vi.mock('../../../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/runtime-messaging')>()),
  createRuntimeMessagingTransport: () => ({
    sendRuntimeMessage: runtimeSendMessageMock,
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
    contains: (...args: unknown[]) => browserPermissionsContainsMock(...args),
    remove: (...args: unknown[]) => browserPermissionsRemoveMock(...args),
  },
}));

const permissions = [initialPermissions[1]!, initialPermissions[2]!];

beforeEach(() => {
  applyPermissionStateMock.mockReset();
  requestCameraPermissionMock.mockReset();
  requestMicrophonePermissionMock.mockReset();
  requestOriginPermissionMock.mockReset();
  requestOriginPermissionsMock.mockReset();
  browserPermissionsContainsMock.mockReset();
  browserPermissionsContainsMock.mockResolvedValue(false);
  browserPermissionsRemoveMock.mockReset();
  browserPermissionsRemoveMock.mockResolvedValue(true);
  runtimeSendMessageMock.mockReset();
  runtimeSendMessageMock.mockResolvedValue({ status: null, success: true });
  applyPermissionStateMock.mockImplementation((currentPermissions, matcher, state) =>
    currentPermissions.map((permission: { id: string }) =>
      matcher(permission) ? { ...permission, state } : permission
    )
  );
});

it('requests camera permission and updates only the camera permission entry', async () => {
  let currentPermissions = permissions;
  const setPermissions = vi.fn((updater) => {
    currentPermissions = typeof updater === 'function' ? updater(currentPermissions) : updater;
  });
  requestCameraPermissionMock.mockResolvedValue('granted');

  await expect(createRequestCameraAction(setPermissions)()).resolves.toBe(true);

  expect(requestCameraPermissionMock).toHaveBeenCalledOnce();
  expect(currentPermissions.map(({ id, state }) => ({ id, state }))).toEqual([
    { id: 'camera', state: 'granted' },
    { id: 'microphone', state: 'prompt' },
  ]);
});

it('returns false when microphone permission remains unavailable', async () => {
  const setPermissions = vi.fn();
  requestMicrophonePermissionMock.mockResolvedValue('denied');

  await expect(createRequestWebMediaAction('microphone', setPermissions)()).resolves.toBe(false);

  expect(requestMicrophonePermissionMock).toHaveBeenCalledOnce();
  expect(setPermissions).toHaveBeenCalledOnce();
});

it('requests grouped origin permissions and marks matching origin entries granted', async () => {
  let currentPermissions = [initialPermissions[0]!];
  const setPermissions = vi.fn((updater) => {
    currentPermissions = typeof updater === 'function' ? updater(currentPermissions) : updater;
  });
  requestOriginPermissionsMock.mockResolvedValue(true);

  await expect(createRequestOriginAction(setPermissions)(initialPermissions[0]!)).resolves.toBe(
    true
  );

  expect(requestOriginPermissionsMock).toHaveBeenCalledWith(['<all_urls>']);
  expect(runtimeSendMessageMock).toHaveBeenCalledWith({
    operation: 'register-granted-all-sites',
    type: 'PAGE_ACCESS',
  });
  expect(requestOriginPermissionMock).not.toHaveBeenCalled();
  expect(currentPermissions[0]?.state).toBe('granted');
});

it('rolls back newly granted grouped origins when registration fails', async () => {
  let currentPermissions = [initialPermissions[0]!];
  const setPermissions = vi.fn((updater) => {
    currentPermissions = typeof updater === 'function' ? updater(currentPermissions) : updater;
  });
  requestOriginPermissionsMock.mockResolvedValue(true);
  runtimeSendMessageMock.mockResolvedValueOnce({
    error: 'registration failed',
    success: false,
  });

  await expect(createRequestOriginAction(setPermissions)(initialPermissions[0]!)).rejects.toThrow(
    'registration failed'
  );

  expect(browserPermissionsRemoveMock).toHaveBeenCalledWith({
    origins: ['<all_urls>'],
  });
  expect(currentPermissions[0]?.state).toBe('prompt');
});

it('requests single origin permissions and leaves state unchanged when denied', async () => {
  const { originPatterns: _originPatterns, ...originPermission } = initialPermissions[0]!;
  const singleOriginPermission = {
    ...originPermission,
    originPattern: 'https://example.test/*',
  };
  let currentPermissions = [singleOriginPermission];
  const setPermissions = vi.fn((updater) => {
    currentPermissions = typeof updater === 'function' ? updater(currentPermissions) : updater;
  });
  requestOriginPermissionMock.mockResolvedValue(false);

  await expect(createRequestOriginAction(setPermissions)(singleOriginPermission)).resolves.toBe(
    false
  );

  expect(requestOriginPermissionMock).toHaveBeenCalledWith('https://example.test/*');
  expect(requestOriginPermissionsMock).not.toHaveBeenCalled();
  expect(setPermissions).not.toHaveBeenCalled();
  expect(currentPermissions[0]?.state).toBe('prompt');
});
