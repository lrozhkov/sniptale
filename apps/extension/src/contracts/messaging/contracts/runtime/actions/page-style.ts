import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isNumber,
  isPageStyleCurrentPageRuleSummary,
  isPageStyleInspectorTab,
  isString,
} from '../../../validators/index';
import type { PartialRuntimeRegistry } from '../../runtime-message.registry.ts';

export const runtimeActionPageStyleMessageContracts = {
  [MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY]: {
    parseRequest: createGuardParser(
      'runtime GET_PAGE_STYLE_CURRENT_RULE_SUMMARY message',
      createMessageGuard({
        type: MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY,
        optional: {
          pageDomain: (value) => value === null || isString(value),
          pageUrl: isString,
          tabId: isNumber,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime GET_PAGE_STYLE_CURRENT_RULE_SUMMARY response',
      createRuntimeResponseGuard({
        optional: { summary: isPageStyleCurrentPageRuleSummary },
      })
    ),
  },
  [MessageType.OPEN_PAGE_STYLE_INSPECTOR]: {
    parseRequest: createGuardParser(
      'runtime OPEN_PAGE_STYLE_INSPECTOR message',
      createMessageGuard({
        type: MessageType.OPEN_PAGE_STYLE_INSPECTOR,
        required: { targetTab: isPageStyleInspectorTab },
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OPEN_PAGE_STYLE_INSPECTOR response',
      createRuntimeResponseGuard({ optional: { result: isString } })
    ),
  },
} satisfies PartialRuntimeRegistry;
