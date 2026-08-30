import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { HandledOffscreenRuntimeMessageType } from './message-types';

export function buildProjectExportCommandSuccessResponse(
  type: HandledOffscreenRuntimeMessageType,
  result: unknown
): { result: 'accepted'; success: true } | null {
  if (
    type !== VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT &&
    type !== VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT
  ) {
    return null;
  }
  if (result !== 'accepted') {
    throw new Error(`Invalid ${type} completion`);
  }
  return { result, success: true };
}
