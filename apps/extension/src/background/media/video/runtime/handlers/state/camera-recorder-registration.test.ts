import { beforeEach, expect, it, vi } from 'vitest';

const {
  authorizeCameraRecorderDocumentMock,
  ensureActiveVideoRecordingLeaseHydratedMock,
  getActiveVideoRecordingLeaseSnapshotMock,
  resolveTrustedCameraRecorderRuntimeSenderUrlMock,
} = vi.hoisted(() => ({
  authorizeCameraRecorderDocumentMock: vi.fn(),
  ensureActiveVideoRecordingLeaseHydratedMock: vi.fn(),
  getActiveVideoRecordingLeaseSnapshotMock: vi.fn(),
  resolveTrustedCameraRecorderRuntimeSenderUrlMock: vi.fn(),
}));

vi.mock('../../../recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../recording-control-lease')>()),
  ensureActiveVideoRecordingLeaseHydrated: ensureActiveVideoRecordingLeaseHydratedMock,
  getActiveVideoRecordingLeaseSnapshot: getActiveVideoRecordingLeaseSnapshotMock,
}));
vi.mock('../../camera-recorder-control', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../camera-recorder-control')>()),
  authorizeCameraRecorderDocument: authorizeCameraRecorderDocumentMock,
}));
vi.mock('../../sender-policy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../sender-policy')>()),
  resolveTrustedCameraRecorderRuntimeSenderUrl: resolveTrustedCameraRecorderRuntimeSenderUrlMock,
}));

import { handleRegisterCameraRecorderControl } from './camera-recorder-registration';

function createSendResponse() {
  return vi.fn<(response?: unknown) => void>();
}

async function flushAsyncRoute() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  ensureActiveVideoRecordingLeaseHydratedMock.mockResolvedValue(null);
  getActiveVideoRecordingLeaseSnapshotMock.mockReturnValue({
    controlToken: 'control-token-1',
    expiresAt: Date.now() + 1000,
    ownerSenderUrl: 'popup-url',
    recordingId: 'rec-1',
  });
  resolveTrustedCameraRecorderRuntimeSenderUrlMock.mockReturnValue('camera-url');
  authorizeCameraRecorderDocumentMock.mockReturnValue(true);
});

it('returns camera recorder control capability after launch-token document binding', async () => {
  const sendResponse = createSendResponse();
  const sender = { documentId: 'document-1', url: 'camera-url' } as chrome.runtime.MessageSender;

  handleRegisterCameraRecorderControl(
    { cameraLaunchToken: 'launch-token-1', recordingId: 'rec-1' },
    sendResponse,
    sender
  );
  await flushAsyncRoute();

  expect(authorizeCameraRecorderDocumentMock).toHaveBeenCalledWith({
    documentId: 'document-1',
    launchToken: 'launch-token-1',
    recordingId: 'rec-1',
    senderUrl: 'camera-url',
  });
  expect(sendResponse).toHaveBeenLastCalledWith({
    controlToken: 'control-token-1',
    recordingId: 'rec-1',
    success: true,
  });
});

it('rejects registration before consuming launch tokens when lease is unavailable', async () => {
  const sendResponse = createSendResponse();
  getActiveVideoRecordingLeaseSnapshotMock.mockReturnValue(null);

  handleRegisterCameraRecorderControl(
    { cameraLaunchToken: 'launch-token-1', recordingId: 'rec-1' },
    sendResponse,
    { documentId: 'document-1', url: 'camera-url' } as chrome.runtime.MessageSender
  );
  await flushAsyncRoute();

  expect(authorizeCameraRecorderDocumentMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenLastCalledWith({
    success: false,
    error: 'Recording control lease is unavailable',
  });
});

it('rejects unauthorized registration without returning control capability', async () => {
  const sendResponse = createSendResponse();
  authorizeCameraRecorderDocumentMock.mockReturnValueOnce(false);

  handleRegisterCameraRecorderControl(
    { cameraLaunchToken: 'wrong-launch-token', recordingId: 'rec-1' },
    sendResponse,
    { documentId: 'document-1', url: 'camera-url' } as chrome.runtime.MessageSender
  );
  await flushAsyncRoute();

  expect(sendResponse).toHaveBeenLastCalledWith({
    success: false,
    error: 'Unauthorized camera recorder control',
  });
});
