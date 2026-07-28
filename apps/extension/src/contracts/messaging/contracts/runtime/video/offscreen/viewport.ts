import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isCaptureMode,
  isNumber,
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
          generation: isNumber,
          recordingId: isString,
          streamInstanceId: isString,
        },
        optional: {
          tabId: isNumber,
          viewport: isViewportInfo,
          captureMode: isCaptureMode,
          cropRegion: isViewportRegion,
          surface: (value) =>
            typeof value === 'object' &&
            value !== null &&
            isString((value as Record<string, unknown>)['presetId']) &&
            ((value as Record<string, unknown>)['target'] === 'viewport' ||
              (value as Record<string, unknown>)['target'] === 'window') &&
            isNumber((value as Record<string, unknown>)['width']) &&
            isNumber((value as Record<string, unknown>)['height']),
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OFFSCREEN_START_RECORDING response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: { result: isString } })
    ),
  },
  [VideoMessageType.OFFSCREEN_BEGIN_RECORDING]: {
    parseRequest: createGuardParser(
      'runtime OFFSCREEN_BEGIN_RECORDING message',
      createMessageGuard({
        type: VideoMessageType.OFFSCREEN_BEGIN_RECORDING,
        required: {
          capabilityToken: isString,
          recordingId: isString,
          generation: isNumber,
          streamInstanceId: isString,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OFFSCREEN_BEGIN_RECORDING response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: { result: isString } })
    ),
  },
  [VideoMessageType.OFFSCREEN_REVALIDATE_SOURCE]: {
    parseRequest: createGuardParser(
      'runtime OFFSCREEN_REVALIDATE_SOURCE message',
      createMessageGuard({
        type: VideoMessageType.OFFSCREEN_REVALIDATE_SOURCE,
        required: {
          capabilityToken: isString,
          recordingId: isString,
          generation: isNumber,
          streamInstanceId: isString,
        },
        optional: { viewport: isViewportInfo },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OFFSCREEN_REVALIDATE_SOURCE response',
      createRuntimeResponseGuard({
        optional: { result: isString, videoWidth: isNumber, videoHeight: isNumber },
      })
    ),
  },
} satisfies PartialRuntimeRegistry;
