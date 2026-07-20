import type { RuntimeMessageResponse } from '@sniptale/runtime-contracts/messaging/contracts/response';
import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { RuntimeRequestByType } from '../contracts/runtime-message/index';
import type { PageStyleCurrentPageRuleSummary } from '@sniptale/runtime-contracts/page-style';

type CurrentPageSummaryRequest =
  RuntimeRequestByType[typeof MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY];
type OpenInspectorRequest = RuntimeRequestByType[typeof MessageType.OPEN_PAGE_STYLE_INSPECTOR];

export type TabPageStyleRequestByType = {
  [MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY]: CurrentPageSummaryRequest;
  [MessageType.OPEN_PAGE_STYLE_INSPECTOR]: OpenInspectorRequest;
};

export type TabPageStyleResponseByType = {
  [MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY]: RuntimeMessageResponse<{
    summary?: PageStyleCurrentPageRuleSummary;
  }>;
  [MessageType.OPEN_PAGE_STYLE_INSPECTOR]: RuntimeMessageResponse<Record<string, never>>;
};
