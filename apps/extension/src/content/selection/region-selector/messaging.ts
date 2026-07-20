import { getContentRuntimeServices } from '../../application/runtime-services/services';
import type { RuntimeMessagingTransport } from '../../../platform/runtime-messaging';

export const sendRegionSelectorRuntimeMessage: RuntimeMessagingTransport['sendRuntimeMessage'] = (
  message
) => getContentRuntimeServices().messaging.sendRuntimeMessage(message);
