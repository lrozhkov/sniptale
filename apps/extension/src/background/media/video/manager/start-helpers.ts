import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  CaptureMode,
  type CaptureSource,
  type VideoRecordingSettings,
  type VideoViewportPresetSelection,
  type ViewportInfo,
} from '@sniptale/runtime-contracts/video/types/types';
import type { RuntimeOffscreenStartRecordingMessage } from '../../../../contracts/messaging/contracts/types';
import type { RuntimeMessagingTransport } from '../../../../platform/runtime-messaging';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { createLogger } from '@sniptale/platform/observability/logger';
import { type ViewportEmulationResult } from '../../../debugger/workspace';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';

type ViewportDetails = ViewportInfo;
const logger = createLogger({ namespace: 'VideoManager' });

type ViewportPixelBounds = {
  width: number;
  height: number;
};

type StartRecordingPayloadArgs = {
  captureMode: CaptureMode;
  captureSource: CaptureSource;
  currentRecordingId: string | null;
  recordingTabId: number | null;
  settings: VideoRecordingSettings;
  viewport?: ViewportDetails;
  viewportEmulationResult?: ViewportEmulationResult;
  viewportPreset?: VideoViewportPresetSelection;
};

function resolveViewportPixelBounds(
  viewportEmulationResult?: ViewportEmulationResult
): ViewportPixelBounds | undefined {
  if (!viewportEmulationResult) {
    return undefined;
  }

  return {
    width: Math.max(1, Math.round(viewportEmulationResult.cssWidth)),
    height: Math.max(1, Math.round(viewportEmulationResult.cssHeight)),
  };
}

function resolveStartPayload(
  args: StartRecordingPayloadArgs
): Omit<RuntimeOffscreenStartRecordingMessage, 'capabilityToken'> {
  const { captureMode, captureSource, currentRecordingId, recordingTabId, settings, viewport } =
    args;

  let cropRegion = captureSource.cropRegion;
  let targetResolution: { width: number; height: number } | undefined;
  let emulatedViewportCssSize: { width: number; height: number } | undefined;

  if (captureMode === CaptureMode.VIEWPORT_EMULATION && args.viewportPreset) {
    cropRegion = undefined;
    targetResolution = {
      width: args.viewportPreset.width,
      height: args.viewportPreset.height,
    };

    emulatedViewportCssSize = resolveViewportPixelBounds(args.viewportEmulationResult);

    if (args.viewportEmulationResult && emulatedViewportCssSize) {
      logger.log('Viewport emulation offscreen bounds resolved', {
        preset: args.viewportPreset,
        emulation: args.viewportEmulationResult,
        viewportBounds: emulatedViewportCssSize,
      });
    }
  }

  return {
    type: VideoMessageType.OFFSCREEN_START_RECORDING,
    streamId: captureSource.streamId,
    settings,
    captureMode,
    ...(recordingTabId === null ? {} : { tabId: recordingTabId }),
    ...(viewport === undefined ? {} : { viewport }),
    ...(currentRecordingId === null ? {} : { recordingId: currentRecordingId }),
    ...(cropRegion === undefined ? {} : { cropRegion }),
    ...(targetResolution === undefined ? {} : { targetResolution }),
    ...(emulatedViewportCssSize === undefined ? {} : { emulatedViewportCssSize }),
  };
}

export function sendOffscreenStartRecording(
  args: StartRecordingPayloadArgs,
  onErrorOrTransport: unknown = getBackgroundRuntimeMessaging(),
  maybeTransport?: Pick<RuntimeMessagingTransport, 'sendRuntimeMessage'>
): Promise<void> {
  const onError = isErrorCallback(onErrorOrTransport) ? onErrorOrTransport : undefined;
  const transport =
    maybeTransport ??
    (isRuntimeMessagingTransport(onErrorOrTransport)
      ? onErrorOrTransport
      : getBackgroundRuntimeMessaging());
  const result = transport
    .sendRuntimeMessage(attachOffscreenCommandCapability(resolveStartPayload(args)))
    .then(() => undefined);
  if (onError) {
    result.catch(onError);
  }
  return result;
}

function isErrorCallback(value: unknown): value is (error: unknown) => void {
  return typeof value === 'function';
}

function isRuntimeMessagingTransport(
  value: unknown
): value is Pick<RuntimeMessagingTransport, 'sendRuntimeMessage'> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sendRuntimeMessage' in value &&
    typeof value.sendRuntimeMessage === 'function'
  );
}
