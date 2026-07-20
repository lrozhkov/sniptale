import type {
  ContentActionIntentClient,
  ContentPrivilegedActionIntentSource,
} from '../../platform/privileged-action-intent/client';
import { createContentActionIntentClient } from '../../platform/privileged-action-intent/client';
import {
  getContentRuntimeServices,
  resetContentRuntimeServicesForTests,
} from '../runtime-services/services';

export type {
  ContentActionIntentMessage,
  ContentActionIntentSendMessage,
} from '../../platform/privileged-action-intent/types';
export type {
  ContentActionIntentClient,
  ContentActionIntentClientDeps,
  ContentPrivilegedActionIntentSource,
} from '../../platform/privileged-action-intent/client';
export { createContentActionIntentClient };

type AttachContentActionIntentParams = Parameters<
  ContentActionIntentClient['attachContentActionIntent']
>;

function getContentActionIntentClient(): ContentActionIntentClient {
  return getContentRuntimeServices().contentActionIntent;
}

export function createTrustedContentActionIntentSource(
  event: Event
): ContentPrivilegedActionIntentSource | null {
  return getContentActionIntentClient().createTrustedContentActionIntentSource(event);
}

export function createBackgroundAutoStartContentActionIntentSource(
  grantToken: string
): ContentPrivilegedActionIntentSource {
  return getContentActionIntentClient().createBackgroundAutoStartContentActionIntentSource(
    grantToken
  );
}

export function resetContentActionIntentRuntimeForTests(): void {
  resetContentRuntimeServicesForTests();
}

export function attachContentActionIntent<TMessage extends AttachContentActionIntentParams[0]>(
  message: TMessage,
  source: ContentPrivilegedActionIntentSource | null | undefined
): Promise<TMessage> {
  return getContentActionIntentClient().attachContentActionIntent(message, source);
}
