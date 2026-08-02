import { beforeEach, expect, it, vi } from 'vitest';

const {
  authorizeCameraRecorderDocumentMock,
  ensureActiveVideoRecordingLeaseHydratedMock,
  getActiveVideoRecordingLeaseSnapshotMock,
  reconnectCameraRecorderDocumentMock,
  resolveTrustedCameraRecorderRuntimeSenderUrlMock,
} = vi.hoisted(() => ({
  authorizeCameraRecorderDocumentMock: vi.fn(),
  ensureActiveVideoRecordingLeaseHydratedMock: vi.fn(),
  getActiveVideoRecordingLeaseSnapshotMock: vi.fn(),
  reconnectCameraRecorderDocumentMock: vi.fn(),
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
  reconnectCameraRecorderDocument: reconnectCameraRecorderDocumentMock,
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
  await new Promise((resolve) => setTimeout(resolve, 0));
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
  authorizeCameraRecorderDocumentMock.mockResolvedValue({
    recordingId: 'rec-1',
  });
  reconnectCameraRecorderDocumentMock.mockResolvedValue({ recordingId: 'rec-1' });
});

it('returns camera recorder control capability after launch-token document binding', async () => {
  const sendResponse = createSendResponse();
  const sender = {
    documentId: 'document-1',
    tab: { id: 7 },
    url: 'camera-url',
  } as chrome.runtime.MessageSender;

  handleRegisterCameraRecorderControl(
    { cameraRegistrationToken: 'launch-token-1', recordingId: 'rec-1' },
    sendResponse,
    sender
  );
  await flushAsyncRoute();

  expect(authorizeCameraRecorderDocumentMock).toHaveBeenCalledWith({
    documentId: 'document-1',
    registrationToken: 'launch-token-1',
    recordingId: 'rec-1',
    senderUrl: 'camera-url',
    tabId: 7,
  });
  expect(sendResponse).toHaveBeenLastCalledWith({
    controlToken: 'control-token-1',
    recordingId: 'rec-1',
    result: 'active',
    success: true,
  });
});

it('reconnects the same post-record camera tab without retaining a page token', async () => {
  const sendResponse = createSendResponse();
  getActiveVideoRecordingLeaseSnapshotMock.mockReturnValue(null);

  handleRegisterCameraRecorderControl({}, sendResponse, {
    documentId: 'document-2',
    tab: { id: 7 },
    url: 'camera-url',
  } as chrome.runtime.MessageSender);
  await flushAsyncRoute();

  expect(authorizeCameraRecorderDocumentMock).not.toHaveBeenCalled();
  expect(reconnectCameraRecorderDocumentMock).toHaveBeenCalledWith({
    documentId: 'document-2',
    senderUrl: 'camera-url',
    tabId: 7,
  });
  expect(sendResponse).toHaveBeenLastCalledWith({
    recordingId: 'rec-1',
    result: 'post-record-only',
    success: true,
  });
});

it('rejects unauthorized registration without returning control capability', async () => {
  const sendResponse = createSendResponse();
  authorizeCameraRecorderDocumentMock.mockResolvedValueOnce(null);

  handleRegisterCameraRecorderControl(
    { cameraRegistrationToken: 'wrong-launch-token', recordingId: 'rec-1' },
    sendResponse,
    { documentId: 'document-1', tab: { id: 7 }, url: 'camera-url' } as chrome.runtime.MessageSender
  );
  await flushAsyncRoute();

  expect(sendResponse).toHaveBeenLastCalledWith({
    success: false,
    error: 'Unauthorized camera recorder control',
  });
});
