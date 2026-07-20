import type { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoViewportPresetSelection } from '@sniptale/runtime-contracts/video/types/types';
import { runBestEffort } from '@sniptale/foundation/best-effort';
import type { RuntimeMessagingTransport } from '../../../../platform/runtime-messaging';
import { setVideoRecordingRuntimeState } from '../runtime/session-state';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';
import { announceCaptureSourceLogger } from './transport.deps';
import type { resolveCaptureSource } from './preflight';

export async function announceCaptureSource(
  captureSource: NonNullable<Awaited<ReturnType<typeof resolveCaptureSource>>>,
  captureMode: CaptureMode,
  viewportPreset?: VideoViewportPresetSelection,
  transport: Pick<RuntimeMessagingTransport, 'sendRuntimeMessage'> = {
    sendRuntimeMessage: (message) => getBackgroundRuntimeMessaging().sendRuntimeMessage(message),
  }
) {
  setVideoRecordingRuntimeState({
    captureSource,
    captureMode,
    viewportPreset: viewportPreset ?? null,
  });
  runBestEffort(
    transport.sendRuntimeMessage({
      type: VideoMessageType.CAPTURE_SOURCE_OBTAINED,
      captureSource,
    }),
    announceCaptureSourceLogger,
    'Failed to announce capture source',
    { captureMode }
  );
}
