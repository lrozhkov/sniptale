import {
  createRuntimeMessagingTransport,
  type RuntimeMessagingTransport,
} from '../../../platform/runtime-messaging';
import {
  createContentActionIntentClient,
  type ContentActionIntentClient,
} from '../privileged-action-intent/client';
import { createContentActionIntentSender } from '../privileged-action-intent/transport';

export type ContentRuntimeServices = {
  contentActionIntent: ContentActionIntentClient;
  messaging: RuntimeMessagingTransport;
};

// policyStateIds: [] - this platform service owns disposable transport wiring only.
export function createContentRuntimeServices(
  overrides: Partial<ContentRuntimeServices> = {}
): ContentRuntimeServices {
  const messaging = overrides.messaging ?? createRuntimeMessagingTransport();
  return {
    contentActionIntent:
      overrides.contentActionIntent ??
      createContentActionIntentClient({
        sendMessage: createContentActionIntentSender(messaging),
      }),
    messaging,
  };
}

let defaultContentRuntimeServices: ContentRuntimeServices | null = null;

export function getContentRuntimeServices(): ContentRuntimeServices {
  defaultContentRuntimeServices ??= createContentRuntimeServices();
  return defaultContentRuntimeServices;
}

export function resetContentRuntimeServicesForTests(): void {
  defaultContentRuntimeServices = null;
}

export function setContentRuntimeServicesForTests(services: ContentRuntimeServices): void {
  defaultContentRuntimeServices = services;
}
