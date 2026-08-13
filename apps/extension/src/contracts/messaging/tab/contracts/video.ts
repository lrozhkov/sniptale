import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  createGuardParser,
  type MessageContractRegistry,
} from '@sniptale/runtime-contracts/messaging/parsers/utils';
import type { TabRequestByType, TabResponseByType } from '../index';
import { tabVideoControlledCursorContracts } from './controlled';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isNumber,
  isString,
  isVideoRecordingRuntimeState,
  isViewportInfo,
  isViewportRegion,
} from '../../validators/index';
import { isVideoRecordingSurfaceSnapshotMessage } from '@sniptale/runtime-contracts/video/types/messages.surface';
import { isViewportCalibrationPattern } from '@sniptale/runtime-contracts/video/types/viewport-calibration';

type PartialTabRegistry = Partial<MessageContractRegistry<TabRequestByType, TabResponseByType>>;
const regionSelectionBindingGuard = {
  regionSelectionCapabilityToken: isString,
  regionSelectionRequestGeneration: isString,
  regionSelectionRequestId: isString,
};
const viewportCursorProjectionAuthorityGuard = {
  generation: (value: unknown) => isNumber(value) && Number.isInteger(value) && value > 0,
  recordingId: isString,
};
const viewportCalibrationAuthorityGuard = {
  generation: (value: unknown) => isNumber(value) && Number.isInteger(value) && value > 0,
  recordingId: isString,
  transitionId: isString,
};
const viewportCalibrationResponseGuard = createRuntimeResponseGuard<
  TabResponseByType[typeof VideoMessageType.SHOW_VIEWPORT_CALIBRATION]
>({
  optional: { result: (value) => value === 'applied' || value === 'stale' },
});

export const tabVideoMessageContracts = {
  [VideoMessageType.RECORDING_STATE_SYNC]: {
    parseRequest: createGuardParser(
      'tab RECORDING_STATE_SYNC message',
      createMessageGuard({
        type: VideoMessageType.RECORDING_STATE_SYNC,
        required: { state: isVideoRecordingRuntimeState },
      })
    ),
    parseResponse: createGuardParser(
      'tab RECORDING_STATE_SYNC response',
      createRuntimeResponseGuard()
    ),
  },
  [VideoMessageType.VIDEO_RECORDING_SURFACE_SNAPSHOT]: {
    parseRequest: createGuardParser(
      'tab VIDEO_RECORDING_SURFACE_SNAPSHOT message',
      isVideoRecordingSurfaceSnapshotMessage
    ),
    parseResponse: createGuardParser(
      'tab VIDEO_RECORDING_SURFACE_SNAPSHOT response',
      createRuntimeResponseGuard()
    ),
  },
  [VideoMessageType.ENABLE_VIEWPORT_CURSOR_PROJECTION]: {
    parseRequest: createGuardParser(
      'tab ENABLE_VIEWPORT_CURSOR_PROJECTION message',
      createMessageGuard({
        type: VideoMessageType.ENABLE_VIEWPORT_CURSOR_PROJECTION,
        required: viewportCursorProjectionAuthorityGuard,
      })
    ),
    parseResponse: createGuardParser(
      'tab ENABLE_VIEWPORT_CURSOR_PROJECTION response',
      createRuntimeResponseGuard()
    ),
  },
  [VideoMessageType.DISABLE_VIEWPORT_CURSOR_PROJECTION]: {
    parseRequest: createGuardParser(
      'tab DISABLE_VIEWPORT_CURSOR_PROJECTION message',
      createMessageGuard({
        type: VideoMessageType.DISABLE_VIEWPORT_CURSOR_PROJECTION,
        required: viewportCursorProjectionAuthorityGuard,
      })
    ),
    parseResponse: createGuardParser(
      'tab DISABLE_VIEWPORT_CURSOR_PROJECTION response',
      createRuntimeResponseGuard()
    ),
  },
  ...tabVideoControlledCursorContracts,
  [VideoMessageType.SHOW_COUNTDOWN]: {
    parseRequest: createGuardParser(
      'tab SHOW_COUNTDOWN message',
      createMessageGuard({
        type: VideoMessageType.SHOW_COUNTDOWN,
        required: { seconds: isNumber },
        optional: { sessionId: isString },
      })
    ),
    parseResponse: createGuardParser('tab SHOW_COUNTDOWN response', createRuntimeResponseGuard()),
  },
  [VideoMessageType.HIDE_COUNTDOWN]: {
    parseRequest: createGuardParser(
      'tab HIDE_COUNTDOWN message',
      createMessageGuard({ type: VideoMessageType.HIDE_COUNTDOWN })
    ),
    parseResponse: createGuardParser('tab HIDE_COUNTDOWN response', createRuntimeResponseGuard()),
  },
  [VideoMessageType.GET_VIEWPORT_COORDS]: {
    parseRequest: createGuardParser(
      'tab GET_VIEWPORT_COORDS message',
      createMessageGuard({ type: VideoMessageType.GET_VIEWPORT_COORDS })
    ),
    parseResponse: createGuardParser(
      'tab GET_VIEWPORT_COORDS response',
      createRuntimeResponseGuard({
        optional: { coords: isViewportRegion, viewport: isViewportInfo },
      })
    ),
  },
  [VideoMessageType.SHOW_VIEWPORT_CALIBRATION]: {
    parseRequest: createGuardParser(
      'tab SHOW_VIEWPORT_CALIBRATION message',
      createMessageGuard({
        type: VideoMessageType.SHOW_VIEWPORT_CALIBRATION,
        required: {
          ...viewportCalibrationAuthorityGuard,
          pattern: isViewportCalibrationPattern,
        },
      })
    ),
    parseResponse: createGuardParser(
      'tab SHOW_VIEWPORT_CALIBRATION response',
      viewportCalibrationResponseGuard
    ),
  },
  [VideoMessageType.HIDE_VIEWPORT_CALIBRATION]: {
    parseRequest: createGuardParser(
      'tab HIDE_VIEWPORT_CALIBRATION message',
      createMessageGuard({
        type: VideoMessageType.HIDE_VIEWPORT_CALIBRATION,
        required: viewportCalibrationAuthorityGuard,
      })
    ),
    parseResponse: createGuardParser(
      'tab HIDE_VIEWPORT_CALIBRATION response',
      viewportCalibrationResponseGuard
    ),
  },
  [VideoMessageType.SHOW_REGION_SELECTOR]: {
    parseRequest: createGuardParser(
      'tab SHOW_REGION_SELECTOR message',
      createMessageGuard({
        type: VideoMessageType.SHOW_REGION_SELECTOR,
        required: regionSelectionBindingGuard,
      })
    ),
    parseResponse: createGuardParser(
      'tab SHOW_REGION_SELECTOR response',
      createRuntimeResponseGuard()
    ),
  },
  [VideoMessageType.HIDE_REGION_SELECTOR]: {
    parseRequest: createGuardParser(
      'tab HIDE_REGION_SELECTOR message',
      createMessageGuard({ type: VideoMessageType.HIDE_REGION_SELECTOR })
    ),
    parseResponse: createGuardParser(
      'tab HIDE_REGION_SELECTOR response',
      createRuntimeResponseGuard()
    ),
  },
  [VideoMessageType.REGION_SELECTED]: {
    parseRequest: createGuardParser(
      'tab REGION_SELECTED message',
      createMessageGuard({
        type: VideoMessageType.REGION_SELECTED,
        required: {
          ...regionSelectionBindingGuard,
          region: isViewportRegion,
          captureViewport: isViewportInfo,
        },
      })
    ),
    parseResponse: createGuardParser('tab REGION_SELECTED response', createRuntimeResponseGuard()),
  },
  [VideoMessageType.REGION_SELECTION_CANCELLED]: {
    parseRequest: createGuardParser(
      'tab REGION_SELECTION_CANCELLED message',
      createMessageGuard({
        type: VideoMessageType.REGION_SELECTION_CANCELLED,
        required: regionSelectionBindingGuard,
      })
    ),
    parseResponse: createGuardParser(
      'tab REGION_SELECTION_CANCELLED response',
      createRuntimeResponseGuard()
    ),
  },
  [VideoMessageType.SHOW_RECORDING_OVERLAY]: {
    parseRequest: createGuardParser(
      'tab SHOW_RECORDING_OVERLAY message',
      createMessageGuard({
        type: VideoMessageType.SHOW_RECORDING_OVERLAY,
        required: { region: isViewportRegion },
      })
    ),
    parseResponse: createGuardParser(
      'tab SHOW_RECORDING_OVERLAY response',
      createRuntimeResponseGuard()
    ),
  },
  [VideoMessageType.HIDE_RECORDING_OVERLAY]: {
    parseRequest: createGuardParser(
      'tab HIDE_RECORDING_OVERLAY message',
      createMessageGuard({ type: VideoMessageType.HIDE_RECORDING_OVERLAY })
    ),
    parseResponse: createGuardParser(
      'tab HIDE_RECORDING_OVERLAY response',
      createRuntimeResponseGuard()
    ),
  },
  [VideoMessageType.ENABLE_DIAGNOSTIC_LOGGER]: {
    parseRequest: createGuardParser(
      'tab ENABLE_DIAGNOSTIC_LOGGER message',
      createMessageGuard({
        type: VideoMessageType.ENABLE_DIAGNOSTIC_LOGGER,
        optional: { recordingId: isString },
      })
    ),
    parseResponse: createGuardParser(
      'tab ENABLE_DIAGNOSTIC_LOGGER response',
      createRuntimeResponseGuard()
    ),
  },
  [VideoMessageType.DISABLE_DIAGNOSTIC_LOGGER]: {
    parseRequest: createGuardParser(
      'tab DISABLE_DIAGNOSTIC_LOGGER message',
      createMessageGuard({ type: VideoMessageType.DISABLE_DIAGNOSTIC_LOGGER })
    ),
    parseResponse: createGuardParser(
      'tab DISABLE_DIAGNOSTIC_LOGGER response',
      createRuntimeResponseGuard()
    ),
  },
} satisfies PartialTabRegistry;
