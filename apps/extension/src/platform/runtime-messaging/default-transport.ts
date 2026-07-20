import type {
  RuntimeMessageType,
  RuntimeRequestByType,
  RuntimeResponseByType,
} from '../../contracts/messaging/contracts/runtime-message';
import type {
  TabMessageType,
  TabRequestByType,
  TabResponseByType,
} from '../../contracts/messaging/tab';
import { createRuntimeMessagingTransport } from './chrome-transport';
import type { RuntimeMessagingTransport } from './transport';

let defaultTransport: RuntimeMessagingTransport | null = null;

function getDefaultTransport(): RuntimeMessagingTransport {
  defaultTransport ??= createRuntimeMessagingTransport();
  return defaultTransport;
}

/**
 * @deprecated Use injected RuntimeMessagingTransport.
 */
export function sendRuntimeMessage<TMessage extends RuntimeRequestByType[RuntimeMessageType]>(
  message: TMessage
): Promise<RuntimeResponseByType[TMessage['type']]> {
  return getDefaultTransport().sendRuntimeMessage(message);
}

/**
 * @deprecated Use injected RuntimeMessagingTransport.
 */
export function sendTabMessage<TMessage extends TabRequestByType[TabMessageType]>(
  tabId: number,
  message: TMessage
): Promise<TabResponseByType[TMessage['type']]> {
  return getDefaultTransport().sendTabMessage(tabId, message);
}
