import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  createGuardParser,
  type MessageContractRegistry,
} from '@sniptale/runtime-contracts/messaging/parsers/utils';
import type { RuntimeRequestByType, RuntimeResponseByType } from '../../runtime-message/index';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isBoolean,
  isCaptureMode,
  isLiveVideoRecordingSettingsPatch,
  isNumber,
  isRecordingStateHealth,
  isString,
  isVideoRecordingRuntimeState,
  isVideoRecordingSettings,
  isVideoViewportPresetSelection,
} from '../../../validators/index';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

type PartialRuntimeRegistry = Partial<
  MessageContractRegistry<RuntimeRequestByType, RuntimeResponseByType>
>;

function isStartRecordingRequest(
  value: unknown
): value is RuntimeRequestByType[typeof VideoMessageType.START_RECORDING] {
  type StartRecordingCandidate = RuntimeRequestByType[typeof VideoMessageType.START_RECORDING];
  const isStartRecordingCandidate = createMessageGuard<
    typeof VideoMessageType.START_RECORDING,
    StartRecordingCandidate
  >({
    type: VideoMessageType.START_RECORDING,
    required: { settings: isVideoRecordingSettings },
    optional: {
      captureMode: isCaptureMode,
      tabId: isNumber,
      viewportPreset: isVideoViewportPresetSelection,
    },
  });

  if (!isStartRecordingCandidate(value)) {
    return false;
  }

  return value.captureMode === CaptureMode.CAMERA || typeof value.tabId === 'number';
}

export const runtimeVideoSessionMessageContracts = {
  [VideoMessageType.START_RECORDING]: {
    parseRequest: createGuardParser('runtime START_RECORDING message', isStartRecordingRequest),
    parseResponse: createGuardParser(
      'runtime START_RECORDING response',
      createRuntimeResponseGuard({
        optional: {
          cameraLaunchToken: isString,
          controlToken: isString,
          recordingId: isString,
          result: isString,
        },
      })
    ),
  },
  [VideoMessageType.STOP_RECORDING]: {
    parseRequest: createGuardParser(
      'runtime STOP_RECORDING message',
      createMessageGuard({
        type: VideoMessageType.STOP_RECORDING,
        required: { controlToken: isString, recordingId: isString },
        optional: { discard: isBoolean },
      })
    ),
    parseResponse: createGuardParser(
      'runtime STOP_RECORDING response',
      createRuntimeResponseGuard({ optional: { result: isString } })
    ),
  },
  [VideoMessageType.CANCEL_RECORDING_START]: {
    parseRequest: createGuardParser(
      'runtime CANCEL_RECORDING_START message',
      createMessageGuard({
        type: VideoMessageType.CANCEL_RECORDING_START,
        required: { controlToken: isString, recordingId: isString },
      })
    ),
    parseResponse: createGuardParser(
      'runtime CANCEL_RECORDING_START response',
      createRuntimeResponseGuard({ optional: { result: isString } })
    ),
  },
  [VideoMessageType.PAUSE_RECORDING]: {
    parseRequest: createGuardParser(
      'runtime PAUSE_RECORDING message',
      createMessageGuard({
        type: VideoMessageType.PAUSE_RECORDING,
        required: { controlToken: isString, recordingId: isString },
      })
    ),
    parseResponse: createGuardParser(
      'runtime PAUSE_RECORDING response',
      createRuntimeResponseGuard({ optional: { result: isString } })
    ),
  },
  [VideoMessageType.RESUME_RECORDING]: {
    parseRequest: createGuardParser(
      'runtime RESUME_RECORDING message',
      createMessageGuard({
        type: VideoMessageType.RESUME_RECORDING,
        required: { controlToken: isString, recordingId: isString },
      })
    ),
    parseResponse: createGuardParser(
      'runtime RESUME_RECORDING response',
      createRuntimeResponseGuard({ optional: { result: isString } })
    ),
  },
  [VideoMessageType.UPDATE_SETTINGS]: {
    parseRequest: createGuardParser(
      'runtime UPDATE_SETTINGS message',
      createMessageGuard({
        type: VideoMessageType.UPDATE_SETTINGS,
        required: {
          controlToken: isString,
          recordingId: isString,
          settings: isLiveVideoRecordingSettingsPatch,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime UPDATE_SETTINGS response',
      createRuntimeResponseGuard({ optional: { result: isString } })
    ),
  },
  [VideoMessageType.GET_RECORDING_STATE]: {
    parseRequest: createGuardParser(
      'runtime GET_RECORDING_STATE message',
      createMessageGuard({ type: VideoMessageType.GET_RECORDING_STATE })
    ),
    parseResponse: createGuardParser(
      'runtime GET_RECORDING_STATE response',
      createRuntimeResponseGuard({
        optional: {
          recordingHealth: isRecordingStateHealth,
          controlToken: isString,
          recordingId: isString,
          state: isVideoRecordingRuntimeState,
        },
      })
    ),
  },
  [VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL]: {
    parseRequest: createGuardParser(
      'runtime REGISTER_CAMERA_RECORDER_CONTROL message',
      createMessageGuard({
        type: VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL,
        required: { cameraLaunchToken: isString, recordingId: isString },
      })
    ),
    parseResponse: createGuardParser(
      'runtime REGISTER_CAMERA_RECORDER_CONTROL response',
      createRuntimeResponseGuard({
        optional: { controlToken: isString, recordingId: isString },
      })
    ),
  },
  [VideoMessageType.GET_RECORDING_TAB_ID]: {
    parseRequest: createGuardParser(
      'runtime GET_RECORDING_TAB_ID message',
      createMessageGuard({ type: VideoMessageType.GET_RECORDING_TAB_ID })
    ),
    parseResponse: createGuardParser(
      'runtime GET_RECORDING_TAB_ID response',
      createRuntimeResponseGuard({
        optional: { isCurrentTab: isBoolean, tabId: isNumber },
      })
    ),
  },
  [VideoMessageType.RECORDING_STATE_SYNC]: {
    parseRequest: createGuardParser(
      'runtime RECORDING_STATE_SYNC message',
      createMessageGuard({
        type: VideoMessageType.RECORDING_STATE_SYNC,
        required: { state: isVideoRecordingRuntimeState },
      })
    ),
    parseResponse: createGuardParser(
      'runtime RECORDING_STATE_SYNC response',
      createRuntimeResponseGuard({ allowUndefined: true })
    ),
  },
  [VideoMessageType.RECORDING_DURATION_UPDATED]: {
    parseRequest: createGuardParser(
      'runtime RECORDING_DURATION_UPDATED message',
      createMessageGuard({
        type: VideoMessageType.RECORDING_DURATION_UPDATED,
        required: { duration: isNumber, recordingId: isString },
      })
    ),
    parseResponse: createGuardParser(
      'runtime RECORDING_DURATION_UPDATED response',
      createRuntimeResponseGuard({ optional: { result: isString } })
    ),
  },
  [VideoMessageType.RECORDING_START_FAILED]: {
    parseRequest: createGuardParser(
      'runtime RECORDING_START_FAILED message',
      createMessageGuard({
        type: VideoMessageType.RECORDING_START_FAILED,
        optional: { error: isString },
      })
    ),
    parseResponse: createGuardParser(
      'runtime RECORDING_START_FAILED response',
      createRuntimeResponseGuard({ allowUndefined: true })
    ),
  },
  [VideoMessageType.COUNTDOWN_COMPLETE]: {
    parseRequest: createGuardParser(
      'runtime COUNTDOWN_COMPLETE message',
      createMessageGuard({
        type: VideoMessageType.COUNTDOWN_COMPLETE,
        required: { sessionId: isString },
      })
    ),
    parseResponse: createGuardParser(
      'runtime COUNTDOWN_COMPLETE response',
      createRuntimeResponseGuard({ allowUndefined: true })
    ),
  },
} satisfies PartialRuntimeRegistry;
