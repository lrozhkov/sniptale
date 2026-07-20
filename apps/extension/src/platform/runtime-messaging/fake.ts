import {
  parseRuntimeRequestMessage,
  parseRuntimeResponseForRequest,
  parseTabRequestMessage,
  parseTabResponseForRequest,
} from '../../contracts/messaging/parsers/boundary';
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
import type { RuntimeMessagingTransport } from './transport';

type RuntimeHandler<TType extends RuntimeMessageType> = (
  message: RuntimeRequestByType[TType],
  index: number
) => unknown | Promise<unknown>;

type TabHandler<TType extends TabMessageType> = (
  message: TabRequestByType[TType],
  tabId: number,
  index: number
) => unknown | Promise<unknown>;

function validateRuntimeRequest<TMessage extends RuntimeRequestByType[RuntimeMessageType]>(
  message: TMessage
): TMessage {
  parseRuntimeRequestMessage(message);
  return message;
}

function validateTabRequest<TMessage extends TabRequestByType[TabMessageType]>(
  message: TMessage
): TMessage {
  parseTabRequestMessage(message);
  return message;
}

/**
 * Deterministic fake transport for messaging unit tests.
 * It captures typed requests and routes them through preconfigured raw responses.
 */
export class FakeRuntimeMessagingTransport implements RuntimeMessagingTransport {
  readonly runtimeRequests: Array<RuntimeRequestByType[RuntimeMessageType]> = [];
  readonly tabRequests: Array<{ tabId: number; message: TabRequestByType[TabMessageType] }> = [];

  private readonly runtimeHandlers = new Map<
    RuntimeMessageType,
    RuntimeHandler<RuntimeMessageType>
  >();
  private readonly tabHandlers = new Map<TabMessageType, TabHandler<TabMessageType>>();

  onRuntimeMessage<TType extends RuntimeMessageType>(
    type: TType,
    handler: RuntimeHandler<TType>
  ): void {
    this.runtimeHandlers.set(type, handler as RuntimeHandler<RuntimeMessageType>);
  }

  onTabMessage<TType extends TabMessageType>(type: TType, handler: TabHandler<TType>): void {
    this.tabHandlers.set(type, handler as TabHandler<TabMessageType>);
  }

  async sendRuntimeMessage<TMessage extends RuntimeRequestByType[RuntimeMessageType]>(
    message: TMessage
  ): Promise<RuntimeResponseByType[TMessage['type']]> {
    const parsedMessage = validateRuntimeRequest(message);
    const index = this.runtimeRequests.push(parsedMessage) - 1;
    const handler = this.runtimeHandlers.get(parsedMessage.type);
    const rawResponse = handler ? await handler(parsedMessage, index) : undefined;
    return parseRuntimeResponseForRequest(parsedMessage, rawResponse);
  }

  async sendTabMessage<TMessage extends TabRequestByType[TabMessageType]>(
    tabId: number,
    message: TMessage
  ): Promise<TabResponseByType[TMessage['type']]> {
    const parsedMessage = validateTabRequest(message);
    const index = this.tabRequests.push({ tabId, message: parsedMessage }) - 1;
    const handler = this.tabHandlers.get(parsedMessage.type);
    const rawResponse = handler ? await handler(parsedMessage, tabId, index) : undefined;
    return parseTabResponseForRequest(parsedMessage, rawResponse);
  }
}
