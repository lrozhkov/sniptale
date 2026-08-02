import { afterEach, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { authorizeRegisteredIPCMessage } from './policy-registry';
import {
  authorizeCameraRecorderDocument,
  clearCameraRecorderControlGrant,
  issueCameraRecorderLaunchToken,
} from '../../../media/video/runtime/camera-recorder-control';

vi.mock('../../../storage/video/camera-recorder-grant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../storage/video/camera-recorder-grant')>()),
  clearCameraRecorderGrant: vi.fn().mockResolvedValue(true),
  createCameraRecorderLaunchGrant: vi.fn(
    async (recordingId: string, registrationToken: string) => ({
      documentId: '',
      expiresAt: Date.now() + 60_000,
      previousRegistrationToken: null,
      registrationToken,
      recordingId,
      senderUrl: '',
      stage: 'launch' as const,
      tabId: null,
    })
  ),
  bindCameraRecorderDocumentGrant: vi.fn(async (args) => ({
    documentId: args.documentId,
    expiresAt: Date.now() + 86_400_000,
    previousRegistrationToken: args.registrationToken,
    registrationToken: args.nextRegistrationToken,
    recordingId: args.recordingId,
    senderUrl: args.senderUrl,
    stage: 'document' as const,
    tabId: args.tabId,
  })),
  readCameraRecorderGrant: vi.fn().mockResolvedValue(null),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
}));

const POPUP_URL = 'chrome-extension://test/apps/extension/src/popup/index.html';
const CAMERA_RECORDER_URL = 'chrome-extension://test/apps/extension/src/camera-recorder/index.html';
const RETIRED_CAMERA_RECORDER_URL = 'chrome-extension://test/src/camera-recorder/index.html';

function sender(props: {
  documentId?: string;
  tabId?: number;
  url?: string;
}): chrome.runtime.MessageSender {
  return {
    ...(props.documentId === undefined ? {} : { documentId: props.documentId }),
    ...(props.tabId === undefined ? {} : { tab: { id: props.tabId } }),
    ...(props.url === undefined ? {} : { url: props.url }),
  } as chrome.runtime.MessageSender;
}

afterEach(async () => {
  await clearCameraRecorderControlGrant();
});

it('narrows anonymous no-tab video controls to popup camera start only', () => {
  expect(
    authorizeRegisteredIPCMessage({
      kind: 'video-control-no-tab-route',
      message: { captureMode: 'CAMERA', type: VideoMessageType.START_RECORDING },
      sender: sender({ url: POPUP_URL }),
    })
  ).toEqual({ authorized: true });
  expect(
    authorizeRegisteredIPCMessage({
      kind: 'video-control-no-tab-route',
      message: { type: VideoMessageType.CANCEL_RECORDING_START },
      sender: sender({ url: POPUP_URL }),
    })
  ).toEqual({ authorized: false, reason: 'Unauthorized video-control no-tab route' });
  expect(
    authorizeRegisteredIPCMessage({
      kind: 'video-control-no-tab-route',
      message: { captureMode: 'CAMERA', type: VideoMessageType.START_RECORDING },
      sender: sender({ url: 'https://example.test/page' }),
    })
  ).toEqual({ authorized: false, reason: 'Unauthorized video-control camera route sender' });
});

it('authorizes popup owner no-tab controls only with control capability fields', () => {
  expect(
    authorizeRegisteredIPCMessage({
      kind: 'video-control-owner-no-tab-route',
      message: {
        controlToken: 'control-token-1',
        recordingId: 'recording-1',
        type: VideoMessageType.CANCEL_RECORDING_START,
      },
      sender: sender({ url: POPUP_URL }),
    })
  ).toEqual({ authorized: true });
  expect(
    authorizeRegisteredIPCMessage({
      kind: 'video-control-owner-no-tab-route',
      message: { type: VideoMessageType.UPDATE_SETTINGS },
      sender: sender({ url: POPUP_URL }),
    })
  ).toEqual({ authorized: false, reason: 'Unauthorized video-control owner no-tab route' });
  expect(
    authorizeRegisteredIPCMessage({
      kind: 'video-control-owner-no-tab-route',
      message: {
        controlToken: 'control-token-1',
        recordingId: 'recording-1',
        type: VideoMessageType.STOP_RECORDING,
      },
      sender: sender({ url: CAMERA_RECORDER_URL }),
    })
  ).toEqual({
    authorized: false,
    reason: 'Unauthorized video-control owner no-tab route sender',
  });
});

it('authorizes camera-recorder controls only for the registered document and recording id', async () => {
  const launchToken = await issueCameraRecorderLaunchToken('recording-1');
  await authorizeCameraRecorderDocument({
    documentId: 'camera-doc-1',
    registrationToken: launchToken,
    recordingId: 'recording-1',
    senderUrl: CAMERA_RECORDER_URL,
    tabId: 7,
  });

  expectCameraRecorderAuthorization('camera-doc-1', 'recording-1', true);
  expectCameraRecorderAuthorization('camera-doc-1', 'recording-1', true, {
    type: VideoMessageType.UPDATE_SETTINGS,
  });
  expectCameraRecorderAuthorization('camera-doc-1', 'recording-1', false, {
    reason: 'Unauthorized camera recorder control route',
    type: VideoMessageType.START_RECORDING,
  });
  expectCameraRecorderAuthorization('camera-doc-2', 'recording-1', false);
  expectCameraRecorderAuthorization('camera-doc-1', 'other-recording', false);
  expectCameraRecorderAuthorization('camera-doc-1', 'recording-1', false, { tabId: 8 });
  expectCameraRecorderAuthorization('camera-doc-1', 'recording-1', false, {
    senderUrl: RETIRED_CAMERA_RECORDER_URL,
  });
  expectCameraRecorderAuthorization('camera-doc-1', 'recording-1', false, {
    senderUrl: 'chrome-extension://spoof/apps/extension/src/camera-recorder/index.html',
  });
});

function expectCameraRecorderAuthorization(
  documentId: string,
  recordingId: string,
  expectedAuthorized: boolean,
  overrides: { reason?: string; senderUrl?: string; tabId?: number; type?: VideoMessageType } = {}
): void {
  expect(
    authorizeRegisteredIPCMessage({
      kind: 'video-control-camera-recorder-route',
      message: {
        controlToken: 'control-token-1',
        recordingId,
        type: overrides.type ?? VideoMessageType.STOP_RECORDING,
      },
      sender: sender({
        documentId,
        tabId: overrides.tabId ?? 7,
        url: overrides.senderUrl ?? CAMERA_RECORDER_URL,
      }),
    })
  ).toEqual(
    expectedAuthorized
      ? { authorized: true }
      : {
          authorized: false,
          reason: overrides.reason ?? 'Unauthorized camera recorder control sender',
        }
  );
}
