import { beforeEach, expect, it, vi } from 'vitest';

import { createRequestCameraAction } from './request-camera';
import { createRequestFileSchemeAction, createRequestOriginAction } from './request-origin';
import { createRequestWebMediaAction } from './request-web-media';
import { initialPermissions } from '../../../permissions-lib';

const {
  applyPermissionStateMock,
  requestCameraPermissionMock,
  requestMicrophonePermissionMock,
  requestOriginPermissionMock,
  requestOriginPermissionsMock,
  browserPermissionsContainsMock,
  browserPermissionsFileAccessMock,
  browserPermissionsRemoveMock,
  openExtensionDetailsPageMock,
  setLocalFileAccessOptInMock,
  runtimeSendMessageMock,
} = vi.hoisted(() => ({
  applyPermissionStateMock: vi.fn(),
  requestCameraPermissionMock: vi.fn(),
  requestMicrophonePermissionMock: vi.fn(),
  requestOriginPermissionMock: vi.fn(),
  requestOriginPermissionsMock: vi.fn(),
  browserPermissionsContainsMock: vi.fn(),
  browserPermissionsFileAccessMock: vi.fn(),
  browserPermissionsRemoveMock: vi.fn(),
  openExtensionDetailsPageMock: vi.fn(),
  setLocalFileAccessOptInMock: vi.fn(),
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
    {
      icon: vi.fn(),
      id: 'localFiles',
      originPattern: 'file:///',
      state: 'prompt',
      type: 'file',
    },
  ],
  applyPermissionState: applyPermissionStateMock,
  requestCameraPermission: requestCameraPermissionMock,
  requestMicrophonePermission: requestMicrophonePermissionMock,
  requestOriginPermission: requestOriginPermissionMock,
  requestOriginPermissions: requestOriginPermissionsMock,
}));

vi.mock('../../../../../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../../../platform/runtime-messaging')>()),
  createRuntimeMessagingTransport: () => ({
    sendRuntimeMessage: runtimeSendMessageMock,
  }),
}));

vi.mock('../../../../../../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../../../../platform/navigation/extension-pages')
  >()),
  openExtensionDetailsPage: openExtensionDetailsPageMock,
}));

vi.mock('../../../../../../../../composition/persistence/settings/file-scheme-consent', () => ({
  hasLocalFileAccessOptIn: vi.fn(),
  setLocalFileAccessOptIn: setLocalFileAccessOptInMock,
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
    isFileSchemeAccessAllowed: () => browserPermissionsFileAccessMock(),
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
  browserPermissionsFileAccessMock.mockReset();
  browserPermissionsFileAccessMock.mockResolvedValue(true);
  browserPermissionsRemoveMock.mockReset();
  browserPermissionsRemoveMock.mockResolvedValue(true);
  openExtensionDetailsPageMock.mockReset();
  setLocalFileAccessOptInMock.mockReset().mockResolvedValue(undefined);
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

it('requests and registers effective local-file access', async () => {
  const permission = initialPermissions[3]!;
  let currentPermissions = [permission];
  const setPermissions = vi.fn((updater) => {
    currentPermissions = typeof updater === 'function' ? updater(currentPermissions) : updater;
  });
  requestOriginPermissionMock.mockResolvedValue(true);

  await expect(createRequestFileSchemeAction(setPermissions)(permission)).resolves.toBe(true);

  expect(requestOriginPermissionMock).toHaveBeenCalledWith('file:///');
  expect(runtimeSendMessageMock).toHaveBeenCalledWith({
    operation: 'register-granted-file-scheme',
    type: 'PAGE_ACCESS',
  });
  expect(setLocalFileAccessOptInMock).toHaveBeenCalledWith(true);
  expect(currentPermissions[0]?.state).toBe('granted');
});

it('uses the canonical file origin when the permission descriptor omits it', async () => {
  const permission = { ...initialPermissions[3]! };
  delete permission.originPattern;
  requestOriginPermissionMock.mockResolvedValue(true);

  await expect(createRequestFileSchemeAction(vi.fn())(permission)).resolves.toBe(true);

  expect(requestOriginPermissionMock).toHaveBeenCalledWith('file:///');
});

it('reuses an existing optional file origin without requesting it again', async () => {
  browserPermissionsContainsMock.mockResolvedValue(true);

  await expect(createRequestFileSchemeAction(vi.fn())(initialPermissions[3]!)).resolves.toBe(true);

  expect(requestOriginPermissionMock).not.toHaveBeenCalled();
  expect(runtimeSendMessageMock).toHaveBeenCalledOnce();
});

it('opens Chrome extension details when browser-managed file access is off', async () => {
  requestOriginPermissionMock.mockResolvedValue(true);
  browserPermissionsFileAccessMock.mockResolvedValue(false);

  await expect(createRequestFileSchemeAction(vi.fn())(initialPermissions[3]!)).resolves.toBe(false);

  expect(openExtensionDetailsPageMock).toHaveBeenCalledOnce();
  expect(requestOriginPermissionMock).not.toHaveBeenCalled();
  expect(runtimeSendMessageMock).not.toHaveBeenCalled();
});

it('keeps local-file access disabled when the optional origin request is denied', async () => {
  requestOriginPermissionMock.mockResolvedValue(false);

  await expect(createRequestFileSchemeAction(vi.fn())(initialPermissions[3]!)).resolves.toBe(false);

  expect(browserPermissionsFileAccessMock).toHaveBeenCalledOnce();
  expect(runtimeSendMessageMock).not.toHaveBeenCalled();
});

it('rolls back only a newly granted file origin when registration fails', async () => {
  requestOriginPermissionMock.mockResolvedValue(true);
  runtimeSendMessageMock.mockResolvedValue({ success: false });

  await expect(createRequestFileSchemeAction(vi.fn())(initialPermissions[3]!)).rejects.toThrow(
    'Failed to register granted local-file access.'
  );

  expect(browserPermissionsRemoveMock).toHaveBeenCalledWith({ origins: ['file:///'] });
  expect(setLocalFileAccessOptInMock).toHaveBeenLastCalledWith(false);
});

it('preserves the registration error when file-origin rollback also fails', async () => {
  requestOriginPermissionMock.mockResolvedValue(true);
  runtimeSendMessageMock.mockResolvedValue({ success: false });
  browserPermissionsRemoveMock.mockRejectedValue(new Error('rollback failed'));

  await expect(createRequestFileSchemeAction(vi.fn())(initialPermissions[3]!)).rejects.toThrow(
    'Failed to register granted local-file access.'
  );
});

it('reconciles a possibly-created file shim when the registration response is lost', async () => {
  requestOriginPermissionMock.mockResolvedValue(true);
  runtimeSendMessageMock
    .mockRejectedValueOnce(new Error('registration response lost'))
    .mockResolvedValueOnce({ success: false });

  await expect(createRequestFileSchemeAction(vi.fn())(initialPermissions[3]!)).rejects.toThrow(
    'registration response lost'
  );

  expect(setLocalFileAccessOptInMock).toHaveBeenNthCalledWith(1, true);
  expect(setLocalFileAccessOptInMock).toHaveBeenNthCalledWith(2, false);
  expect(runtimeSendMessageMock).toHaveBeenCalledTimes(2);
});

it('preserves a pre-existing file origin when registration fails', async () => {
  browserPermissionsContainsMock.mockResolvedValue(true);
  runtimeSendMessageMock.mockResolvedValue({ success: false });

  await expect(createRequestFileSchemeAction(vi.fn())(initialPermissions[3]!)).rejects.toThrow(
    'Failed to register granted local-file access.'
  );

  expect(browserPermissionsRemoveMock).not.toHaveBeenCalled();
});
