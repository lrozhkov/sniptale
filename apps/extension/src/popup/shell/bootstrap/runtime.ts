import {
  createRuntimeMessagingTransport,
  type RuntimeMessagingTransport,
} from '../../../platform/runtime-messaging';

export type { RuntimeMessagingTransport };

export const popupBootstrapTransport = createRuntimeMessagingTransport();
