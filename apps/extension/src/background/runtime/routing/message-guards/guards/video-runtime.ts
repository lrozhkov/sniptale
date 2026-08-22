import { collectBackgroundIngressRouteTypes } from '../../../../../contracts/messaging/contracts/runtime';
import type { VideoRuntimeMessage } from '../../../../../contracts/video/types/messages';
import type { RuntimeMessageEnvelope } from './shared';

const videoRuntimeMessageTypes = collectBackgroundIngressRouteTypes({
  actionKind: 'video-runtime',
}) as readonly VideoRuntimeMessage['type'][];

export function isVideoRuntimeMessage(
  message: RuntimeMessageEnvelope
): message is VideoRuntimeMessage {
  return videoRuntimeMessageTypes.includes(message.type as VideoRuntimeMessage['type']);
}
