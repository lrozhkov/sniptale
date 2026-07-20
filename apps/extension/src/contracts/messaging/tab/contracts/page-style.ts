import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { MessageContractRegistry } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import { runtimeMessageContracts } from '../../contracts/runtime';
import type { TabRequestByType, TabResponseByType } from '../index';

type PartialTabRegistry = Partial<MessageContractRegistry<TabRequestByType, TabResponseByType>>;

export const tabPageStyleMessageContracts = {
  [MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY]: {
    parseRequest:
      runtimeMessageContracts[MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY].parseRequest,
    parseResponse:
      runtimeMessageContracts[MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY].parseResponse,
  },
  [MessageType.OPEN_PAGE_STYLE_INSPECTOR]: {
    parseRequest: runtimeMessageContracts[MessageType.OPEN_PAGE_STYLE_INSPECTOR].parseRequest,
    parseResponse: runtimeMessageContracts[MessageType.OPEN_PAGE_STYLE_INSPECTOR].parseResponse,
  },
} satisfies PartialTabRegistry;
