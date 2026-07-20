import { expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  isOffscreenOnlyVideoRuntimeMessage,
  isTrustedOffscreenRuntimeSender,
  resolveOffscreenRuntimeCapabilityContext,
  resolveTrustedCameraRecorderRuntimeSenderUrl,
  resolveTrustedPopupRuntimeSenderUrl,
  resolveTrustedVideoEditorRuntimeSender,
  resolveTrustedVideoEditorRuntimeSenderUrl,
} from './sender-policy';

const RETIRED_CAMERA_RECORDER_URL = 'chrome-extension://test/src/camera-recorder/index.html';

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
}));

it('accepts only exact popup and video editor extension document senders', () => {
  expect(
    resolveTrustedPopupRuntimeSenderUrl({
      url: 'chrome-extension://test/apps/extension/src/popup/index.html?ignored=true',
    })
  ).toBe('chrome-extension://test/apps/extension/src/popup/index.html');
  expect(resolveTrustedPopupRuntimeSenderUrl()).toBeNull();
  expect(
    resolveTrustedPopupRuntimeSenderUrl({
      url: 'chrome-extension://test/apps/extension/src/settings/index.html',
    })
  ).toBeNull();
  expect(
    resolveTrustedVideoEditorRuntimeSenderUrl({
      url: 'chrome-extension://test/apps/extension/src/video-editor/index.html',
    })
  ).toBe('chrome-extension://test/apps/extension/src/video-editor/index.html');
  expect(
    resolveTrustedVideoEditorRuntimeSender({
      url: 'chrome-extension://test/apps/extension/src/video-editor/index.html',
    })
  ).toBeNull();
  expect(
    resolveTrustedVideoEditorRuntimeSender({
      documentId: 'editor-doc-1',
      url: 'chrome-extension://test/apps/extension/src/video-editor/index.html',
    })
  ).toEqual({
    documentId: 'editor-doc-1',
    senderUrl: 'chrome-extension://test/apps/extension/src/video-editor/index.html',
  });
});

it('accepts only the moved camera recorder document and rejects retired or spoofed urls', () => {
  expect(
    resolveTrustedCameraRecorderRuntimeSenderUrl({
      url: 'chrome-extension://test/apps/extension/src/camera-recorder/index.html?recordingId=1',
    })
  ).toBe('chrome-extension://test/apps/extension/src/camera-recorder/index.html');
  expect(
    resolveTrustedCameraRecorderRuntimeSenderUrl({
      url: RETIRED_CAMERA_RECORDER_URL,
    })
  ).toBeNull();
  expect(
    resolveTrustedCameraRecorderRuntimeSenderUrl({
      url: 'chrome-extension://spoof/apps/extension/src/camera-recorder/index.html',
    })
  ).toBeNull();
  expect(
    resolveTrustedCameraRecorderRuntimeSenderUrl({
      url: 'chrome-extension://test/apps/extension/src/camera-recorder/index.html.evil',
    })
  ).toBeNull();
});

it('resolves offscreen runtime senders through a scoped CapabilityContext', () => {
  expect(
    isTrustedOffscreenRuntimeSender({
      url: 'chrome-extension://test/apps/extension/src/offscreen/offscreen.html',
    })
  ).toBe(true);
  expect(
    resolveOffscreenRuntimeCapabilityContext(
      {
        documentId: 'offscreen-doc-1',
        url: 'chrome-extension://test/apps/extension/src/offscreen/offscreen.html',
      },
      1_000
    )
  ).toEqual({
    expiresAtEpochMs: 2_000,
    origin: 'chrome-extension://test',
    scopes: ['offscreen:runtime'],
    tabId: null,
    token: 'offscreen-doc-1',
  });
  expect(
    resolveOffscreenRuntimeCapabilityContext({
      documentId: 'content-doc-1',
      url: 'https://example.test/page',
    })
  ).toBeNull();
});

it('keeps offscreen-only runtime message ownership explicit', () => {
  expect(
    isOffscreenOnlyVideoRuntimeMessage({
      duration: 100,
      recordingId: 'recording-1',
      type: VideoMessageType.RECORDING_DURATION_UPDATED,
    })
  ).toBe(true);
  expect(
    isOffscreenOnlyVideoRuntimeMessage({
      desktopMediaRequestGeneration: 'generation-1',
      desktopMediaRequestId: 'request-1',
      label: 'Screen',
      type: VideoMessageType.DESKTOP_MEDIA_OBTAINED,
    })
  ).toBe(true);
  expect(isOffscreenOnlyVideoRuntimeMessage({ type: VideoMessageType.GET_RECORDING_STATE })).toBe(
    false
  );
});
