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

export type RuntimeMessagingDeps = {
  runtimeSendMessage: (message: unknown) => Promise<unknown>;
  tabSendMessage: (tabId: number, message: unknown) => Promise<unknown>;
};

/**
 * Typed request/response transport used by messaging business logic.
 */
export type RuntimeMessagingTransport = {
  sendRuntimeMessage<TMessage extends RuntimeRequestByType[RuntimeMessageType]>(
    message: TMessage
  ): Promise<RuntimeResponseByType[TMessage['type']]>;
  sendTabMessage<TMessage extends TabRequestByType[TabMessageType]>(
    tabId: number,
    message: TMessage
  ): Promise<TabResponseByType[TMessage['type']]>;
};
