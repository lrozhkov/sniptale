import {
  MessageContractError,
  parseMessageWithRegistry,
  parseResponseWithRegistry,
} from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  backgroundRuntimeTypes,
  contentTabTypes,
  offscreenRuntimeTypes,
  popupRuntimeTypes,
} from './supported-types.data.ts';
import { runtimeMessageContracts } from '../contracts/runtime';
import { stripRuntimeMessageFreshness } from '@sniptale/runtime-contracts/protocol/runtime-message-freshness';
import type {
  RuntimeMessageType,
  RuntimeRequestByType,
  RuntimeResponseByType,
} from '../contracts/runtime-message/index';
import { tabMessageContracts } from '../tab/contracts';
import type { TabMessageType, TabRequestByType, TabResponseByType } from '../tab/index';

function assertRuntimeBoundaryType(
  type: RuntimeMessageType,
  supportedTypes: ReadonlySet<RuntimeMessageType>,
  label: string
): void {
  if (!supportedTypes.has(type)) {
    throw new MessageContractError(`${label} does not support message type: ${type}`);
  }
}

function assertTabBoundaryType(
  type: TabMessageType,
  supportedTypes: ReadonlySet<TabMessageType>,
  label: string
): void {
  if (!supportedTypes.has(type)) {
    throw new MessageContractError(`${label} does not support message type: ${type}`);
  }
}

export function parseRuntimeRequestMessage(
  input: unknown
): RuntimeRequestByType[RuntimeMessageType] {
  const withoutFreshness = stripRuntimeMessageFreshness(input);
  return parseMessageWithRegistry(withoutFreshness, runtimeMessageContracts);
}

export function parseRuntimeResponseForMessage<TType extends RuntimeMessageType>(
  type: TType,
  input: unknown
): RuntimeResponseByType[TType] {
  return parseResponseWithRegistry(type, input, runtimeMessageContracts);
}

export function parseRuntimeResponseForRequest<
  TMessage extends RuntimeRequestByType[RuntimeMessageType],
>(message: TMessage, input: unknown): RuntimeResponseByType[TMessage['type']] {
  return parseResponseWithRegistry(
    message.type,
    input,
    runtimeMessageContracts
  ) as RuntimeResponseByType[TMessage['type']];
}

export function parseTabRequestMessage(input: unknown): TabRequestByType[TabMessageType] {
  return parseMessageWithRegistry(input, tabMessageContracts);
}

export function parseTabResponseForMessage<TType extends TabMessageType>(
  type: TType,
  input: unknown
): TabResponseByType[TType] {
  return parseResponseWithRegistry(type, input, tabMessageContracts);
}

export function parseTabResponseForRequest<TMessage extends TabRequestByType[TabMessageType]>(
  message: TMessage,
  input: unknown
): TabResponseByType[TMessage['type']] {
  return parseResponseWithRegistry(
    message.type,
    input,
    tabMessageContracts
  ) as TabResponseByType[TMessage['type']];
}

export function parseBackgroundRuntimeMessage(
  input: unknown
): RuntimeRequestByType[RuntimeMessageType] {
  const message = parseRuntimeRequestMessage(input);
  assertRuntimeBoundaryType(message.type, backgroundRuntimeTypes, 'Background runtime boundary');
  return message;
}

export function parsePopupRuntimeMessage(input: unknown): RuntimeRequestByType[RuntimeMessageType] {
  const message = parseRuntimeRequestMessage(input);
  assertRuntimeBoundaryType(message.type, popupRuntimeTypes, 'Popup runtime boundary');
  return message;
}

export function parseOffscreenRuntimeMessage(
  input: unknown
): RuntimeRequestByType[RuntimeMessageType] {
  const message = parseRuntimeRequestMessage(input);
  assertRuntimeBoundaryType(message.type, offscreenRuntimeTypes, 'Offscreen runtime boundary');
  return message;
}

export function parseContentTabMessage(input: unknown): TabRequestByType[TabMessageType] {
  const message = parseTabRequestMessage(input);
  assertTabBoundaryType(message.type, contentTabTypes, 'Content tab boundary');
  return message;
}
