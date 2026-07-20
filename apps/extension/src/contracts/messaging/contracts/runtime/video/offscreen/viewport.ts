import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isBoolean,
  isCaptureMode,
  isNumber,
  isSize2d,
  isString,
  isVideoRecordingSettings,
  isViewportInfo,
  isViewportRegion,
} from '../../../../validators/index';
import type { PartialRuntimeRegistry } from '../../../runtime-message.registry.ts';

export const runtimeVideoOffscreenViewportMessageContracts = {
  [VideoMessageType.OFFSCREEN_START_RECORDING]: {
    parseRequest: createGuardParser(
      'runtime OFFSCREEN_START_RECORDING message',
      createMessageGuard({
        type: VideoMessageType.OFFSCREEN_START_RECORDING,
        required: {
          capabilityToken: isString,
          streamId: isString,
          settings: isVideoRecordingSettings,
        },
        optional: {
          tabId: isNumber,
          viewport: isViewportInfo,
          recordingId: isString,
          captureMode: isCaptureMode,
          cropRegion: isViewportRegion,
          targetResolution: isSize2d,
          emulatedViewportCssSize: isSize2d,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OFFSCREEN_START_RECORDING response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: { result: isString } })
    ),
  },
  [VideoMessageType.OFFSCREEN_UPDATE_VIEWPORT_CROP]: {
    parseRequest: createGuardParser(
      'runtime OFFSCREEN_UPDATE_VIEWPORT_CROP message',
      createMessageGuard({
        type: VideoMessageType.OFFSCREEN_UPDATE_VIEWPORT_CROP,
        required: { capabilityToken: isString },
        optional: {
          targetResolution: isSize2d,
          emulatedViewportCssSize: isSize2d,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OFFSCREEN_UPDATE_VIEWPORT_CROP response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: { result: isString } })
    ),
  },
  [VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE]: {
    parseRequest: createGuardParser(
      'runtime OFFSCREEN_SET_VIEWPORT_DRAW_STATE message',
      createMessageGuard({
        type: VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE,
        required: { capabilityToken: isString, frozen: isBoolean, navigationEpoch: isNumber },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OFFSCREEN_SET_VIEWPORT_DRAW_STATE response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: { result: isString } })
    ),
  },
} satisfies PartialRuntimeRegistry;
