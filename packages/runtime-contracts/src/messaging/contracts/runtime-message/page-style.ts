import type { RuntimeMessageResponse } from '../response';
import type { MessageType } from '../../message-types';
import type { PageStyleCurrentPageRuleSummary, PageStyleInspectorTab } from '../../../page-style';

export type RuntimePageStyleRequestByType = {
  [MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY]: {
    type: typeof MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY;
    pageDomain?: string | null;
    pageUrl?: string;
    tabId?: number;
  };
  [MessageType.OPEN_PAGE_STYLE_INSPECTOR]: {
    type: typeof MessageType.OPEN_PAGE_STYLE_INSPECTOR;
    tabId?: number;
    targetTab: PageStyleInspectorTab;
  };
};

export type RuntimePageStyleResponseByType = {
  [MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY]: RuntimeMessageResponse<{
    summary?: PageStyleCurrentPageRuleSummary;
  }>;
  [MessageType.OPEN_PAGE_STYLE_INSPECTOR]: RuntimeMessageResponse<Record<string, never>>;
};
