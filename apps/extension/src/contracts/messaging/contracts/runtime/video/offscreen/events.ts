import { VideoCursorCaptureMode } from '../../../../../../features/video/project/types';
import { VideoDisplaySurface } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isBoolean,
  isCaptureMode,
  isCaptureSource,
  isNumber,
  isString,
  isWebcamActualSettings,
} from '../../../../validators/index';
import type { PartialRuntimeRegistry } from '../../../runtime-message.registry.ts';
import { runtimeVideoRegionSelectionEventContracts } from './events.region-selection.ts';

function isOffscreenErrorPhase(value: unknown): value is 'start' | 'stop' | 'runtime' | 'export' {
  return value === 'start' || value === 'stop' || value === 'runtime' || value === 'export';
}

function isDesktopMediaAcquirePhase(
  value: unknown
): value is 'desktop-stream-acquire' | 'display-media-acquire' {
  return value === 'desktop-stream-acquire' || value === 'display-media-acquire';
}

function isVideoCursorCaptureMode(value: unknown): boolean {
  return (
    value === VideoCursorCaptureMode.SEPARATE || value === VideoCursorCaptureMode.EMBEDDED_FALLBACK
  );
}

function isVideoDisplaySurface(value: unknown): boolean {
  return (
    value === VideoDisplaySurface.BROWSER ||
    value === VideoDisplaySurface.MONITOR ||
    value === VideoDisplaySurface.WINDOW
  );
}

const desktopMediaRequestBindingGuard = {
  desktopMediaRequestGeneration: isString,
  desktopMediaRequestId: isString,
};
const desktopMediaSourcePositionGuard = { sourceCount: isNumber, sourceIndex: isNumber };
const V = VideoMessageType;

export const runtimeVideoOffscreenEventMessageContracts = {
  [V.OFFSCREEN_RECORDING_STARTED]: {
    parseRequest: createGuardParser(
      'runtime OFFSCREEN_RECORDING_STARTED message',
      createMessageGuard({
        type: V.OFFSCREEN_RECORDING_STARTED,
        required: { recordingId: isString },
        optional: {
          cursorCaptureMode: isVideoCursorCaptureMode,
          displaySurface: isVideoDisplaySurface,
          webcamSettings: isWebcamActualSettings,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OFFSCREEN_RECORDING_STARTED response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: { result: isString } })
    ),
  },
  [V.OFFSCREEN_RECORDING_STOPPED]: {
    parseRequest: createGuardParser(
      'runtime OFFSCREEN_RECORDING_STOPPED message',
      createMessageGuard({
        type: V.OFFSCREEN_RECORDING_STOPPED,
        required: { recordingId: isString },
        optional: { filename: isString },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OFFSCREEN_RECORDING_STOPPED response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: { result: isString } })
    ),
  },
  [V.OFFSCREEN_RECORDING_PAUSED]: {
    parseRequest: createGuardParser(
      'runtime OFFSCREEN_RECORDING_PAUSED message',
      createMessageGuard({
        type: V.OFFSCREEN_RECORDING_PAUSED,
        required: { recordingId: isString },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OFFSCREEN_RECORDING_PAUSED response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: { result: isString } })
    ),
  },
  [V.OFFSCREEN_RECORDING_RESUMED]: {
    parseRequest: createGuardParser(
      'runtime OFFSCREEN_RECORDING_RESUMED message',
      createMessageGuard({
        type: V.OFFSCREEN_RECORDING_RESUMED,
        required: { recordingId: isString },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OFFSCREEN_RECORDING_RESUMED response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: { result: isString } })
    ),
  },
  [V.OFFSCREEN_ERROR]: {
    parseRequest: createGuardParser(
      'runtime OFFSCREEN_ERROR message',
      createMessageGuard({
        type: V.OFFSCREEN_ERROR,
        optional: {
          error: isString,
          offscreenStartupId: isString,
          phase: isOffscreenErrorPhase,
          recordingId: isString,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OFFSCREEN_ERROR response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: { result: isString } })
    ),
  },
  [V.GET_DESKTOP_MEDIA]: {
    parseRequest: createGuardParser(
      'runtime GET_DESKTOP_MEDIA message',
      createMessageGuard({
        type: V.GET_DESKTOP_MEDIA,
        required: {
          capabilityToken: isString,
          captureMode: isCaptureMode,
          ...desktopMediaRequestBindingGuard,
        },
        optional: {
          controlledCursorCaptureEnabled: isBoolean,
          desktopLabel: isString,
          desktopStreamId: isString,
          ...desktopMediaSourcePositionGuard,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime GET_DESKTOP_MEDIA response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: { result: isString } })
    ),
  },
  [V.DISPOSE_DESKTOP_MEDIA]: {
    parseRequest: createGuardParser(
      'runtime DISPOSE_DESKTOP_MEDIA message',
      createMessageGuard({
        type: V.DISPOSE_DESKTOP_MEDIA,
        required: { capabilityToken: isString },
      })
    ),
    parseResponse: createGuardParser(
      'runtime DISPOSE_DESKTOP_MEDIA response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: { result: isString } })
    ),
  },
  ...runtimeVideoRegionSelectionEventContracts,
  [V.DESKTOP_MEDIA_OBTAINED]: {
    parseRequest: createGuardParser(
      'runtime DESKTOP_MEDIA_OBTAINED message',
      createMessageGuard({
        type: V.DESKTOP_MEDIA_OBTAINED,
        required: {
          ...desktopMediaRequestBindingGuard,
          label: isString,
        },
        optional: desktopMediaSourcePositionGuard,
      })
    ),
    parseResponse: createGuardParser(
      'runtime DESKTOP_MEDIA_OBTAINED response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: { result: isString } })
    ),
  },
  [V.DESKTOP_MEDIA_CANCELLED]: {
    parseRequest: createGuardParser(
      'runtime DESKTOP_MEDIA_CANCELLED message',
      createMessageGuard({
        type: V.DESKTOP_MEDIA_CANCELLED,
        required: desktopMediaRequestBindingGuard,
        optional: desktopMediaSourcePositionGuard,
      })
    ),
    parseResponse: createGuardParser(
      'runtime DESKTOP_MEDIA_CANCELLED response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: { result: isString } })
    ),
  },
  [V.DESKTOP_MEDIA_FAILED]: {
    parseRequest: createGuardParser(
      'runtime DESKTOP_MEDIA_FAILED message',
      createMessageGuard({
        type: V.DESKTOP_MEDIA_FAILED,
        required: {
          ...desktopMediaRequestBindingGuard,
          error: isString,
          phase: isDesktopMediaAcquirePhase,
        },
        optional: desktopMediaSourcePositionGuard,
      })
    ),
    parseResponse: createGuardParser(
      'runtime DESKTOP_MEDIA_FAILED response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: { result: isString } })
    ),
  },
  [V.CAPTURE_SOURCE_OBTAINED]: {
    parseRequest: createGuardParser(
      'runtime CAPTURE_SOURCE_OBTAINED message',
      createMessageGuard({
        type: V.CAPTURE_SOURCE_OBTAINED,
        required: { captureSource: isCaptureSource },
      })
    ),
    parseResponse: createGuardParser(
      'runtime CAPTURE_SOURCE_OBTAINED response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: { result: isString } })
    ),
  },
} satisfies PartialRuntimeRegistry;
