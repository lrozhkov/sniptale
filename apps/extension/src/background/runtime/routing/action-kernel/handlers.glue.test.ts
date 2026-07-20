import { beforeEach, expect, it, vi } from 'vitest';

const { routeBackgroundOwnedActionMock, routeTabActionMock, routeVideoRuntimeActionMock } =
  vi.hoisted(() => ({
    routeBackgroundOwnedActionMock: vi.fn(),
    routeTabActionMock: vi.fn(),
    routeVideoRuntimeActionMock: vi.fn(),
  }));

vi.mock('./owned-route', () => ({
  routeBackgroundOwnedAction: routeBackgroundOwnedActionMock,
}));
vi.mock('./tab-route', () => ({
  routeTabAction: routeTabActionMock,
}));
vi.mock('./video-runtime-route', () => ({
  routeVideoRuntimeAction: routeVideoRuntimeActionMock,
}));
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoControlMessage } from '../../../../contracts/video/types/messages';
import { createBackgroundRuntimeState } from '../../../application/runtime-state';
import { createActionContext } from './context';
import {
  handleBackgroundOwnedAction,
  handleInternalSignalAction,
  handleTabAction,
  handleUnknownAction,
  handleVideoRuntimeAction,
} from './handlers';
import type {
  BackgroundOwnedAction,
  InternalSignalAction,
  TabAction,
  UnknownAction,
  VideoRuntimeAction,
} from './types';

function createContext(sendResponse = vi.fn()) {
  return createActionContext({
    logger: { warn: vi.fn() },
    runtimeState: createBackgroundRuntimeState(),
    sendResponse,
    sender: { url: 'chrome-extension://test/apps/extension/src/background/index.html' },
  });
}

function createBackgroundOwnedAction(): BackgroundOwnedAction {
  return {
    actionKind: 'background-owned',
    context: createContext(),
    message: { type: MessageType.REQUEST_LLM_SESSION },
    routeName: `background-owned:${MessageType.REQUEST_LLM_SESSION}`,
  };
}

function createVideoRuntimeAction(): VideoRuntimeAction {
  return {
    actionKind: 'video-runtime',
    context: createContext(),
    message: { type: VideoMessageType.GET_RECORDING_STATE },
    routeName: `video-runtime:${VideoMessageType.GET_RECORDING_STATE}`,
  };
}

function createTabAction(): TabAction {
  const message: VideoControlMessage = {
    controlToken: 'control-token-1',
    recordingId: 'recording-1',
    type: VideoMessageType.STOP_RECORDING,
  };
  return {
    actionKind: 'tab',
    context: createContext(),
    message,
    resolvedTabId: 7,
    routeName: `tab:${VideoMessageType.STOP_RECORDING}`,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  routeBackgroundOwnedActionMock.mockReturnValue({ handled: true, keepChannelOpen: false });
  routeTabActionMock.mockReturnValue({ handled: true, keepChannelOpen: true });
  routeVideoRuntimeActionMock.mockReturnValue({ handled: true, keepChannelOpen: false });
});

it('keeps internal and unknown action handling in the glue layer', () => {
  const sendResponse = vi.fn();
  const context = createContext(sendResponse);
  const internalAction: InternalSignalAction = {
    actionKind: 'internal-signal',
    context,
    routeName: 'internal-signal',
  };
  const unknownAction: UnknownAction = {
    actionKind: 'unknown',
    context,
    message: { type: 'UNKNOWN_BACKGROUND_MESSAGE' },
    routeName: 'unknown',
  };

  expect(handleInternalSignalAction(internalAction)).toEqual({
    handled: true,
    keepChannelOpen: false,
  });
  expect(handleUnknownAction(unknownAction)).toEqual({ handled: true, keepChannelOpen: false });
  expect(context.logger.warn).toHaveBeenCalledWith('Unknown background runtime message type', {
    type: 'UNKNOWN_BACKGROUND_MESSAGE',
  });
  expect(sendResponse).toHaveBeenCalledWith({ error: 'Unknown message type', success: false });
});

it('delegates owned, tab, and video runtime actions to their adapters', () => {
  const backgroundAction = createBackgroundOwnedAction();
  const tabAction = createTabAction();
  const videoAction = createVideoRuntimeAction();

  expect(handleBackgroundOwnedAction(backgroundAction)).toEqual({
    handled: true,
    keepChannelOpen: false,
  });
  expect(handleTabAction(tabAction)).toEqual({ handled: true, keepChannelOpen: true });
  expect(handleVideoRuntimeAction(videoAction)).toEqual({
    handled: true,
    keepChannelOpen: false,
  });
  expect(routeBackgroundOwnedActionMock).toHaveBeenCalledWith(backgroundAction);
  expect(routeTabActionMock).toHaveBeenCalledWith(tabAction);
  expect(routeVideoRuntimeActionMock).toHaveBeenCalledWith(videoAction);
});
