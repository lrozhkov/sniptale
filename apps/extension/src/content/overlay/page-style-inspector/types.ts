import type {
  PageStyleAssetReference,
  PageStyleInspectorTab,
  PageStylePatch,
  PageStyleProperty,
  PageStyleRestoreRule,
  PageStyleTemplate,
} from '@sniptale/runtime-contracts/page-style';
import type {
  PageStyleDeclarationValueMap,
  PageStyleSelectionSnapshot,
} from './runtime/properties';

export interface PageStyleInspectorViewState {
  activeTab: PageStyleInspectorTab;
  defaultValues: PageStyleDeclarationValueMap;
  draftPatch: PageStylePatch;
  includeComputedInTemplate: boolean;
  modifiedProperties: PageStyleProperty[];
  registryError?: string | null;
  registryLoading?: boolean;
  ruleName: string;
  ruleQuery: string;
  rules: PageStyleRestoreRule[];
  retainImage: boolean;
  retainText: boolean;
  selection: PageStyleSelectionSnapshot | null;
  sideFieldLinks?: Record<string, boolean>;
  templateQuery: string;
  templateName: string;
  templates: PageStyleTemplate[];
  values: PageStyleDeclarationValueMap;
}

export type PageStyleInspectorActionOutcome = {
  message: string;
  state: 'success' | 'warning';
} | void;
export type PageStyleTemplateActionOutcome = PageStyleInspectorActionOutcome;

export interface PageStyleInspectorActions {
  applyRule: (rule: PageStyleRestoreRule) => Promise<void>;
  applyTemplate: (template: PageStyleTemplate) => Promise<void>;
  clearBackgroundAsset: () => Promise<PageStyleInspectorActionOutcome>;
  close: () => void;
  saveBackgroundAsset: (file: File) => Promise<PageStyleInspectorActionOutcome>;
  saveImageReplacement: (file: File) => Promise<PageStyleInspectorActionOutcome>;
  saveRule: () => Promise<void>;
  saveTemplate: () => Promise<void>;
  deleteRule: (rule: PageStyleRestoreRule) => Promise<PageStyleInspectorActionOutcome>;
  deleteTemplate: (template: PageStyleTemplate) => Promise<PageStyleTemplateActionOutcome>;
  duplicateTemplate: (template: PageStyleTemplate) => Promise<void>;
  renameTemplate: (template: PageStyleTemplate, name: string) => Promise<void>;
  resetValue: (property: PageStyleProperty) => void;
  setActiveTab: (tab: PageStyleInspectorTab) => void;
  setIncludeComputedInTemplate: (value: boolean) => void;
  setRuleQuery: (value: string) => void;
  setRuleName: (value: string) => void;
  setRetainImage: (value: boolean) => void;
  setRetainText: (value: boolean) => void;
  setSideFieldLinked?: (fieldKey: string, linked: boolean) => void;
  setTemplateQuery: (value: string) => void;
  setTemplateName: (value: string) => void;
  toggleRuleEnabled: (rule: PageStyleRestoreRule) => Promise<void>;
  updateTemplate: (template: PageStyleTemplate) => Promise<PageStyleTemplateActionOutcome>;
  updateAssetPatch: (asset: PageStyleAssetReference) => Promise<PageStyleInspectorActionOutcome>;
  updateValue: (property: PageStyleProperty, value: string) => void;
  updateValues: (updates: Array<{ property: PageStyleProperty; value: string }>) => void;
}
