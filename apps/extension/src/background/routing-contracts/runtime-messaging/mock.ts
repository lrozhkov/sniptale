import { FakeRuntimeMessagingTransport } from '../../../platform/runtime-messaging/fake';
import type { RuntimeMessagingTransport } from '../../../platform/runtime-messaging/transport';
import { setBackgroundRuntimeMessagingForTests } from './services';

type LooseRuntimeMessageSender = (message: unknown) => Promise<unknown>;
type LooseTabMessageSender = (tabId: number, message: unknown) => Promise<unknown>;

export function installBackgroundRuntimeMessagingMock(
  args: {
    sendRuntimeMessage?:
      | RuntimeMessagingTransport['sendRuntimeMessage']
      | LooseRuntimeMessageSender;
    sendTabMessage?: RuntimeMessagingTransport['sendTabMessage'] | LooseTabMessageSender;
  } = {}
) {
  const fakeTransport = new FakeRuntimeMessagingTransport();
  const sendRuntimeMessage =
    args.sendRuntimeMessage ?? fakeTransport.sendRuntimeMessage.bind(fakeTransport);
  const sendTabMessage = args.sendTabMessage ?? fakeTransport.sendTabMessage.bind(fakeTransport);

  setBackgroundRuntimeMessagingForTests({
    sendRuntimeMessage: sendRuntimeMessage as RuntimeMessagingTransport['sendRuntimeMessage'],
    sendTabMessage: sendTabMessage as RuntimeMessagingTransport['sendTabMessage'],
  });

  return { sendRuntimeMessage, sendTabMessage };
}
