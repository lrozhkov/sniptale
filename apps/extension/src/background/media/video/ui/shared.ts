import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';

export type RecordingRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function showRecordingOverlay(tabId: number, region: RecordingRegion): Promise<void> {
  await getBackgroundRuntimeMessaging().sendTabMessage(tabId, {
    type: VideoMessageType.SHOW_RECORDING_OVERLAY,
    region,
  });
}
