import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isBoolean,
  isLiveVideoRecordingSettingsPatch,
  isNumber,
  isString,
} from '../../../../validators/index';
import type { PartialRuntimeRegistry } from '../../../runtime-message.registry.ts';

export const runtimeVideoOffscreenControlMessageContracts = {
  [VideoMessageType.OFFSCREEN_READINESS_PROBE]: {
    parseRequest: createGuardParser(
      'runtime OFFSCREEN_READINESS_PROBE message',
      createMessageGuard({
        type: VideoMessageType.OFFSCREEN_READINESS_PROBE,
        required: {
          capabilityToken: isString,
          challenge: isString,
          offscreenStartupId: isString,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OFFSCREEN_READINESS_PROBE response',
      createRuntimeResponseGuard({
        required: {
          challenge: isString,
          offscreenStartupId: isString,
          state: (value) => value === 'failed' || value === 'ready',
        },
      })
    ),
  },
  [VideoMessageType.OFFSCREEN_READY]: {
    parseRequest: createGuardParser(
      'runtime OFFSCREEN_READY message',
      createMessageGuard({
        type: VideoMessageType.OFFSCREEN_READY,
        required: { offscreenStartupId: isString },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OFFSCREEN_READY response',
      createRuntimeResponseGuard({ optional: { result: isString } })
    ),
  },
  [VideoMessageType.OFFSCREEN_STOP_RECORDING]: {
    parseRequest: createGuardParser(
      'runtime OFFSCREEN_STOP_RECORDING message',
      createMessageGuard({
        type: VideoMessageType.OFFSCREEN_STOP_RECORDING,
        required: {
          capabilityToken: isString,
          recordingId: isString,
          generation: isNumber,
          streamInstanceId: isString,
        },
        optional: { discard: isBoolean },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OFFSCREEN_STOP_RECORDING response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: { result: isString } })
    ),
  },
  [VideoMessageType.OFFSCREEN_PAUSE_RECORDING]: {
    parseRequest: createGuardParser(
      'runtime OFFSCREEN_PAUSE_RECORDING message',
      createMessageGuard({
        type: VideoMessageType.OFFSCREEN_PAUSE_RECORDING,
        required: {
          capabilityToken: isString,
          recordingId: isString,
          generation: isNumber,
          streamInstanceId: isString,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OFFSCREEN_PAUSE_RECORDING response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: { result: isString } })
    ),
  },
  [VideoMessageType.OFFSCREEN_RESUME_RECORDING]: {
    parseRequest: createGuardParser(
      'runtime OFFSCREEN_RESUME_RECORDING message',
      createMessageGuard({
        type: VideoMessageType.OFFSCREEN_RESUME_RECORDING,
        required: {
          capabilityToken: isString,
          recordingId: isString,
          generation: isNumber,
          streamInstanceId: isString,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OFFSCREEN_RESUME_RECORDING response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: { result: isString } })
    ),
  },
  [VideoMessageType.OFFSCREEN_UPDATE_SETTINGS]: {
    parseRequest: createGuardParser(
      'runtime OFFSCREEN_UPDATE_SETTINGS message',
      createMessageGuard({
        type: VideoMessageType.OFFSCREEN_UPDATE_SETTINGS,
        required: {
          capabilityToken: isString,
          recordingId: isString,
          generation: isNumber,
          streamInstanceId: isString,
          settings: isLiveVideoRecordingSettingsPatch,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OFFSCREEN_UPDATE_SETTINGS response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: { result: isString } })
    ),
  },
} satisfies PartialRuntimeRegistry;
