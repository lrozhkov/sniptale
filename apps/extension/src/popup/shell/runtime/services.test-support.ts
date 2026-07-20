import { FakeRuntimeMessagingTransport } from '../../../platform/runtime-messaging/fake';
import type { RuntimeMessagingTransport } from '../../../platform/runtime-messaging/transport';
import { resetPopupRuntimeServicesForTests, setPopupRuntimeServicesForTests } from './services';

type LooseRuntimeMessageSender = (message: unknown) => Promise<unknown>;
type RuntimeMessageSender = RuntimeMessagingTransport['sendRuntimeMessage'];

export function installPopupRuntimeMessagingMock(
  sendRuntimeMessage: RuntimeMessageSender,
  sendTabMessage?: RuntimeMessagingTransport['sendTabMessage']
): {
  sendRuntimeMessage: RuntimeMessageSender;
  sendTabMessage: RuntimeMessagingTransport['sendTabMessage'];
};
export function installPopupRuntimeMessagingMock(
  sendRuntimeMessage: LooseRuntimeMessageSender,
  sendTabMessage?: RuntimeMessagingTransport['sendTabMessage']
): {
  sendRuntimeMessage: LooseRuntimeMessageSender;
  sendTabMessage: RuntimeMessagingTransport['sendTabMessage'];
};
export function installPopupRuntimeMessagingMock(
  sendRuntimeMessage: RuntimeMessageSender | LooseRuntimeMessageSender,
  sendTabMessage?: RuntimeMessagingTransport['sendTabMessage']
) {
  const fakeTransport = new FakeRuntimeMessagingTransport();
  const resolvedSendTabMessage = sendTabMessage ?? fakeTransport.sendTabMessage.bind(fakeTransport);
  setPopupRuntimeServicesForTests({
    messaging: {
      sendRuntimeMessage: sendRuntimeMessage as RuntimeMessagingTransport['sendRuntimeMessage'],
      sendTabMessage: resolvedSendTabMessage,
    },
  });
  return { sendRuntimeMessage, sendTabMessage: resolvedSendTabMessage };
}

export function resetPopupRuntimeMessagingMock(): void {
  resetPopupRuntimeServicesForTests();
}
