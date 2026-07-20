import {
  createRuntimeMessagingTransport,
  type RuntimeMessagingTransport,
} from '../../../platform/runtime-messaging';

// policyStateIds: [] - this service owns disposable transport wiring, not authority state.
type BackgroundRuntimeMessaging = RuntimeMessagingTransport;

let defaultBackgroundRuntimeMessaging: BackgroundRuntimeMessaging | null = null;

export function getBackgroundRuntimeMessaging(): BackgroundRuntimeMessaging {
  defaultBackgroundRuntimeMessaging ??= createRuntimeMessagingTransport();
  return defaultBackgroundRuntimeMessaging;
}

export function resetBackgroundRuntimeMessagingForTests(): void {
  defaultBackgroundRuntimeMessaging = null;
}

export function setBackgroundRuntimeMessagingForTests(messaging: BackgroundRuntimeMessaging): void {
  defaultBackgroundRuntimeMessaging = messaging;
}
