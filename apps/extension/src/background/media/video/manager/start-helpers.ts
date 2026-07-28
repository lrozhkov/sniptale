import { createLogger } from '@sniptale/platform/observability/logger';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type {
  CaptureMode,
  CaptureSource,
  VideoRecordingSettings,
  ViewportInfo,
} from '@sniptale/runtime-contracts/video/types/types';
import type { RuntimeMessagingTransport } from '../../../../platform/runtime-messaging';
import type { AppliedCaptureSurface } from '../../../capture-surface';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';

const logger = createLogger({ namespace: 'VideoManager' });

type StartRecordingPayloadArgs = {
  captureMode: CaptureMode;
  captureSource: CaptureSource;
  generation: number;
  recordingId: string;
  streamInstanceId: string;
  recordingTabId: number | null;
  settings: VideoRecordingSettings;
  surface: AppliedCaptureSurface | null;
  viewport?: ViewportInfo;
};

export function sendOffscreenStartRecording(
  args: StartRecordingPayloadArgs,
  transport: Pick<RuntimeMessagingTransport, 'sendRuntimeMessage'> = getBackgroundRuntimeMessaging()
): Promise<void> {
  return transport
    .sendRuntimeMessage(
      attachOffscreenCommandCapability({
        type: VideoMessageType.OFFSCREEN_START_RECORDING,
        streamId: args.captureSource.streamId,
        settings: args.settings,
        captureMode: args.captureMode,
        recordingId: args.recordingId,
        generation: args.generation,
        streamInstanceId: args.streamInstanceId,
        ...(args.recordingTabId === null ? {} : { tabId: args.recordingTabId }),
        ...((args.captureSource.captureViewport ?? args.viewport) === undefined
          ? {}
          : { viewport: args.captureSource.captureViewport ?? args.viewport }),
        ...(args.captureSource.cropRegion === undefined
          ? {}
          : { cropRegion: args.captureSource.cropRegion }),
        ...(args.surface === null
          ? {}
          : {
              surface: {
                presetId: args.surface.presetId,
                target: args.surface.target,
                width: args.surface.width,
                height: args.surface.height,
              },
            }),
      })
    )
    .then((response) => {
      if (response?.success === false) {
        throw new Error(response.error ?? 'Offscreen rejected recording source preparation');
      }
      logger.debug('Offscreen recording source preparation dispatched', {
        recordingId: args.recordingId,
      });
    });
}

export function sendOffscreenBeginRecording(args: {
  generation: number;
  recordingId: string;
  streamInstanceId: string;
}): Promise<void> {
  return getBackgroundRuntimeMessaging()
    .sendRuntimeMessage(
      attachOffscreenCommandCapability({
        type: VideoMessageType.OFFSCREEN_BEGIN_RECORDING,
        generation: args.generation,
        recordingId: args.recordingId,
        streamInstanceId: args.streamInstanceId,
      })
    )
    .then((response) => {
      if (response?.success === false) {
        throw new Error(response.error ?? 'Offscreen rejected recording start');
      }
    });
}
