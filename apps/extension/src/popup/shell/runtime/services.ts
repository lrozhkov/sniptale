import {
  createRuntimeMessagingTransport,
  type RuntimeMessagingTransport,
} from '../../../platform/runtime-messaging';

type PopupRuntimeServices = {
  messaging: RuntimeMessagingTransport;
};

// policyStateIds: [] - this runtime service owns disposable transport wiring only.
function createPopupRuntimeServices(
  overrides: Partial<PopupRuntimeServices> = {}
): PopupRuntimeServices {
  return {
    messaging: overrides.messaging ?? createRuntimeMessagingTransport(),
  };
}

let defaultPopupRuntimeServices: PopupRuntimeServices | null = null;

export function getPopupRuntimeServices(): PopupRuntimeServices {
  defaultPopupRuntimeServices ??= createPopupRuntimeServices();
  return defaultPopupRuntimeServices;
}

export function resetPopupRuntimeServicesForTests(): void {
  defaultPopupRuntimeServices = null;
}

export function setPopupRuntimeServicesForTests(services: PopupRuntimeServices): void {
  defaultPopupRuntimeServices = services;
}
