import type {
  PageStyleContentRetention,
  PageStylePatch,
  PageStyleProperty,
  PageStyleScope,
  PageStyleSelectorIdentity,
} from '@sniptale/runtime-contracts/page-style';

export interface SavePageStyleTemplateInput {
  id?: string;
  name: string;
  patch: PageStylePatch;
  propertySummary?: PageStyleProperty[];
}

export interface SavePageStyleRestoreRuleInput {
  contentRetention?: PageStyleContentRetention;
  enabled?: boolean;
  id?: string;
  name: string;
  patch: PageStylePatch;
  propertySummary?: PageStyleProperty[];
  scope: PageStyleScope;
  selector: PageStyleSelectorIdentity;
  templateId?: string | null;
}

export type PageStylePageIdentity = { pageDomain?: string | null; pageUrl: string };
