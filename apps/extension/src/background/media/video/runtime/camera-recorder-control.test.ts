import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  authorizeCameraRecorderDocument,
  clearCameraRecorderControlGrant,
  isAuthorizedCameraRecorderDocument,
  issueCameraRecorderLaunchToken,
} from './camera-recorder-control';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  clearCameraRecorderControlGrant();
});

afterEach(() => {
  vi.useRealTimers();
});

it('binds a camera recorder launch token to one document', () => {
  const launchToken = issueCameraRecorderLaunchToken('recording-1');

  expect(
    authorizeCameraRecorderDocument({
      documentId: 'document-1',
      launchToken,
      recordingId: 'recording-1',
      senderUrl: 'chrome-extension://test/apps/extension/src/camera-recorder/index.html',
    })
  ).toBe(true);
  expect(
    isAuthorizedCameraRecorderDocument({
      documentId: 'document-1',
      recordingId: 'recording-1',
      senderUrl: 'chrome-extension://test/apps/extension/src/camera-recorder/index.html',
    })
  ).toBe(true);
  expect(
    authorizeCameraRecorderDocument({
      documentId: 'document-2',
      launchToken,
      recordingId: 'recording-1',
      senderUrl: 'chrome-extension://test/apps/extension/src/camera-recorder/index.html',
    })
  ).toBe(false);
});

it('rejects stale launch tokens and cleanup revokes registered documents', () => {
  const launchToken = issueCameraRecorderLaunchToken('recording-1');

  vi.setSystemTime(62_000);

  expect(
    authorizeCameraRecorderDocument({
      documentId: 'document-1',
      launchToken,
      recordingId: 'recording-1',
      senderUrl: 'chrome-extension://test/apps/extension/src/camera-recorder/index.html',
    })
  ).toBe(false);

  const nextLaunchToken = issueCameraRecorderLaunchToken('recording-2');
  expect(
    authorizeCameraRecorderDocument({
      documentId: 'document-1',
      launchToken: nextLaunchToken,
      recordingId: 'recording-2',
      senderUrl: 'chrome-extension://test/apps/extension/src/camera-recorder/index.html',
    })
  ).toBe(true);
  clearCameraRecorderControlGrant('recording-2');
  expect(
    isAuthorizedCameraRecorderDocument({
      documentId: 'document-1',
      recordingId: 'recording-2',
      senderUrl: 'chrome-extension://test/apps/extension/src/camera-recorder/index.html',
    })
  ).toBe(false);
});
