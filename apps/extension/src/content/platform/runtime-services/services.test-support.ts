import { FakeRuntimeMessagingTransport } from '../../../platform/runtime-messaging/fake';
import type { RuntimeMessagingTransport } from '../../../platform/runtime-messaging/transport';
import { createContentActionIntentClient } from '../privileged-action-intent/client';
import { createContentActionIntentSender } from '../privileged-action-intent/transport';
import { resetContentRuntimeServicesForTests, setContentRuntimeServicesForTests } from './services';

type LooseRuntimeMessageSender = (message: unknown) => Promise<unknown>;
type RuntimeMessageSender = RuntimeMessagingTransport['sendRuntimeMessage'];

export function installContentRuntimeMessagingMock(sendRuntimeMessage: RuntimeMessageSender): {
  sendRuntimeMessage: RuntimeMessageSender;
  sendTabMessage: RuntimeMessagingTransport['sendTabMessage'];
};
export function installContentRuntimeMessagingMock(sendRuntimeMessage: LooseRuntimeMessageSender): {
  sendRuntimeMessage: LooseRuntimeMessageSender;
  sendTabMessage: RuntimeMessagingTransport['sendTabMessage'];
};
export function installContentRuntimeMessagingMock(
  sendRuntimeMessage: RuntimeMessageSender | LooseRuntimeMessageSender
) {
  const fakeTransport = new FakeRuntimeMessagingTransport();
  const sendTabMessage = fakeTransport.sendTabMessage.bind(fakeTransport);
  const messaging = {
    sendRuntimeMessage: sendRuntimeMessage as RuntimeMessagingTransport['sendRuntimeMessage'],
    sendTabMessage,
  };
  setContentRuntimeServicesForTests({
    contentActionIntent: createContentActionIntentClient({
      sendMessage: createContentActionIntentSender(messaging),
    }),
    messaging,
  });
  return { sendRuntimeMessage, sendTabMessage };
}

export function resetContentRuntimeMessagingMock(): void {
  resetContentRuntimeServicesForTests();
}
