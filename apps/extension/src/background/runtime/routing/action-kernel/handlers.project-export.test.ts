import { beforeEach, expect, it, vi } from 'vitest';

const {
  authorizeIPCMessageMock,
  authorizeProjectExportRuntimeMessageMock,
  isOffscreenOnlyVideoRuntimeMessageMock,
  routeVideoRuntimeMessageMock,
} = vi.hoisted(() => ({
  authorizeIPCMessageMock: vi.fn(),
  authorizeProjectExportRuntimeMessageMock: vi.fn(),
  isOffscreenOnlyVideoRuntimeMessageMock: vi.fn(),
  routeVideoRuntimeMessageMock: vi.fn(),
}));

vi.mock('../authorization/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../authorization/index')>()),
  authorizeIPCMessage: authorizeIPCMessageMock,
  authorizeProjectExportRuntimeMessage: authorizeProjectExportRuntimeMessageMock,
}));

vi.mock('../../../media/video/runtime/router', () => ({
  routeVideoRuntimeMessage: routeVideoRuntimeMessageMock,
}));
vi.mock('../../../media/video/runtime/sender-policy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../media/video/runtime/sender-policy')>()),
  isOffscreenOnlyVideoRuntimeMessage: isOffscreenOnlyVideoRuntimeMessageMock,
}));
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  type VideoProjectExportSettings,
} from '../../../../features/video/project/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoRuntimeMessage } from '../../../../contracts/video/types/messages';
import { createBackgroundRuntimeState } from '../../../application/runtime-state';
import { createActionContext } from './context';
import { handleVideoRuntimeAction } from './handlers';
import type { VideoRuntimeAction } from './types';

function createExportSettings(): VideoProjectExportSettings {
  return {
    downloadAfterExport: true,
    format: VideoExportFormat.MP4,
    fps: 30,
    height: 720,
    quality: VideoExportQualityPreset.BALANCED,
    width: 1280,
  };
}

function createInputReference() {
  return {
    contentSha256: `sha256:${'a'.repeat(64)}`,
    jobId: 'job-1',
    projectId: 'project-1',
    retainedByteLength: 3 * 1024 * 1024,
  };
}

function createStartExportMessage(): VideoRuntimeMessage {
  return {
    capabilityToken: 'start-token',
    jobId: 'job-1',
    input: createInputReference(),
    settings: createExportSettings(),
    type: VideoMessageType.START_PROJECT_EXPORT,
  };
}

function createVideoRuntimeAction(sendResponse = vi.fn()): VideoRuntimeAction {
  return {
    actionKind: 'video-runtime',
    context: createActionContext({
      logger: { warn: vi.fn() },
      runtimeState: createBackgroundRuntimeState(),
      sendResponse,
      sender: {
        documentId: 'video-doc-1',
        url: 'chrome-extension://test/apps/extension/src/video-editor/index.html',
      },
    }),
    message: createStartExportMessage(),
    routeName: `video-runtime:${VideoMessageType.START_PROJECT_EXPORT}`,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authorizeIPCMessageMock.mockReturnValue({ authorized: true });
  isOffscreenOnlyVideoRuntimeMessageMock.mockReturnValue(false);
  routeVideoRuntimeMessageMock.mockReturnValue({ handled: true, keepChannelOpen: true });
});

it('passes project export preauthorization from authorization to the video router', async () => {
  const sendResponse = vi.fn();
  const owner = {
    documentId: 'video-doc-1',
    kind: 'project-export' as const,
    senderUrl: 'chrome-extension://test/apps/extension/src/video-editor/index.html',
  };
  authorizeProjectExportRuntimeMessageMock.mockResolvedValueOnce({
    authorized: true,
    preauthorization: owner,
  });

  expect(handleVideoRuntimeAction(createVideoRuntimeAction(sendResponse))).toEqual({
    handled: true,
    keepChannelOpen: true,
  });
  await vi.waitFor(() => {
    expect(routeVideoRuntimeMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: VideoMessageType.START_PROJECT_EXPORT }),
      sendResponse,
      undefined,
      expect.objectContaining({ documentId: 'video-doc-1' }),
      owner
    );
  });
});

it('responds when project export authorization rejects before owner side effects', async () => {
  const sendResponse = vi.fn();
  authorizeProjectExportRuntimeMessageMock.mockRejectedValueOnce(
    new Error('capability storage unavailable')
  );

  expect(handleVideoRuntimeAction(createVideoRuntimeAction(sendResponse))).toEqual({
    handled: true,
    keepChannelOpen: true,
  });
  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith({
      error: 'capability storage unavailable',
      success: false,
    });
  });
  expect(routeVideoRuntimeMessageMock).not.toHaveBeenCalled();
});

it('responds when project export authorization denies before owner side effects', async () => {
  const sendResponse = vi.fn();
  authorizeProjectExportRuntimeMessageMock.mockResolvedValueOnce({
    authorized: false,
    reason: 'Unauthorized project export capability',
  });

  expect(handleVideoRuntimeAction(createVideoRuntimeAction(sendResponse))).toEqual({
    handled: true,
    keepChannelOpen: true,
  });
  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith({
      error: 'Unauthorized project export capability',
      success: false,
    });
  });
  expect(routeVideoRuntimeMessageMock).not.toHaveBeenCalled();
});

it('rejects offscreen-only video runtime actions before routing owner side effects', () => {
  const sendResponse = vi.fn();
  const action = createVideoRuntimeAction(sendResponse);
  action.message = {
    offscreenStartupId: 'startup-1',
    type: VideoMessageType.OFFSCREEN_READY,
  };
  isOffscreenOnlyVideoRuntimeMessageMock.mockReturnValueOnce(true);
  authorizeIPCMessageMock.mockReturnValueOnce({
    authorized: false,
    reason: 'Unauthorized offscreen runtime sender',
  });

  expect(handleVideoRuntimeAction(action)).toEqual({ handled: true, keepChannelOpen: false });
  expect(action.context.logger.warn).toHaveBeenCalledWith(
    'Rejected offscreen-only runtime message from untrusted sender',
    {
      senderUrl: 'chrome-extension://test/apps/extension/src/video-editor/index.html',
      type: VideoMessageType.OFFSCREEN_READY,
    }
  );
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Unauthorized offscreen runtime sender',
    success: false,
  });
  expect(routeVideoRuntimeMessageMock).not.toHaveBeenCalled();
});

it('routes authorized offscreen-only actions and propagates unhandled owner results', () => {
  const action = createVideoRuntimeAction();
  action.message = {
    offscreenStartupId: 'startup-1',
    type: VideoMessageType.OFFSCREEN_READY,
  };
  isOffscreenOnlyVideoRuntimeMessageMock.mockReturnValueOnce(true);
  routeVideoRuntimeMessageMock.mockReturnValueOnce({ handled: false, keepChannelOpen: false });

  expect(handleVideoRuntimeAction(action)).toEqual({ handled: false });
  expect(authorizeIPCMessageMock).toHaveBeenCalledWith({
    kind: 'offscreen-runtime',
    message: action.message,
    sender: action.context.sender,
  });
  expect(routeVideoRuntimeMessageMock).toHaveBeenCalledWith(
    action.message,
    action.context.sendResponse,
    undefined,
    action.context.sender,
    undefined
  );
});
