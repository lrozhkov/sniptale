export const PAGE_STYLE_SCHEMA_VERSION = 1;

export const PAGE_STYLE_SCOPE_TYPES = {
  DOMAIN: 'domain',
  EXACT_ADDRESS: 'exactAddress',
} as const;

export type PageStyleScopeType =
  (typeof PAGE_STYLE_SCOPE_TYPES)[keyof typeof PAGE_STYLE_SCOPE_TYPES];

export const PAGE_STYLE_ASSET_KINDS = {
  BACKGROUND_IMAGE: 'backgroundImage',
  IMAGE_REPLACEMENT: 'imageReplacement',
} as const;

export type PageStyleAssetKind =
  (typeof PAGE_STYLE_ASSET_KINDS)[keyof typeof PAGE_STYLE_ASSET_KINDS];

export const PAGE_STYLE_INSPECTOR_TABS = {
  PROPERTIES: 'properties',
  RULES: 'rules',
  TEMPLATES: 'templates',
} as const;

export type PageStyleInspectorTab =
  (typeof PAGE_STYLE_INSPECTOR_TABS)[keyof typeof PAGE_STYLE_INSPECTOR_TABS];

export const PAGE_STYLE_ALLOWED_PROPERTIES = [
  'background-color',
  'background-image',
  'border-bottom-color',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  'border-bottom-style',
  'border-bottom-width',
  'border-left-color',
  'border-left-style',
  'border-left-width',
  'border-right-color',
  'border-right-style',
  'border-right-width',
  'border-top-color',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-top-style',
  'border-top-width',
  'box-shadow',
  'color',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'height',
  'letter-spacing',
  'line-height',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'object-fit',
  'object-position',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'text-align',
  'text-decoration',
  'width',
] as const;

export type PageStyleProperty = (typeof PAGE_STYLE_ALLOWED_PROPERTIES)[number];

export interface PageStyleDeclaration {
  property: PageStyleProperty;
  value: string | null;
}

export interface PageStyleAssetReference {
  assetId: string;
  kind: PageStyleAssetKind;
  filename?: string;
  height?: number | null;
  mimeType?: string;
  size?: number;
  width?: number | null;
}

export interface PageStylePatch {
  assets: PageStyleAssetReference[];
  declarations: PageStyleDeclaration[];
}

export interface PageStyleSelectorIdentity {
  locator: string;
  sniptaleId?: string;
}

export interface PageStyleScope {
  active: PageStyleScopeType;
  domain?: string | null;
  exactAddress: string;
}

interface PageStyleTextRetention {
  enabled: true;
  text: string;
}

interface PageStyleImageRetention {
  asset: PageStyleAssetReference;
  enabled: true;
}

export interface PageStyleContentRetention {
  image?: PageStyleImageRetention;
  text?: PageStyleTextRetention;
}

export interface PageStyleTemplate {
  createdAt: number;
  id: string;
  name: string;
  patch: PageStylePatch;
  propertySummary: PageStyleProperty[];
  updatedAt: number;
}

export interface PageStyleRestoreRule {
  contentRetention?: PageStyleContentRetention;
  createdAt: number;
  enabled: boolean;
  id: string;
  name: string;
  patch: PageStylePatch;
  propertySummary: PageStyleProperty[];
  scope: PageStyleScope;
  selector: PageStyleSelectorIdentity;
  templateId?: string | null;
  updatedAt: number;
}

export interface PageStyleRuleSummary {
  enabled: boolean;
  id: string;
  name: string;
  propertySummary: PageStyleProperty[];
  scope: PageStyleScope;
}

export interface PageStyleCurrentPageRuleSummary {
  activeAppliedCount: number;
  matchedRules: PageStyleRuleSummary[];
  pageDomain?: string | null;
  pageUrl: string;
}

export interface PageStyleRegistry {
  restoreRules: PageStyleRestoreRule[];
  schemaVersion: typeof PAGE_STYLE_SCHEMA_VERSION;
  templates: PageStyleTemplate[];
}

export function isPageStyleProperty(value: unknown): value is PageStyleProperty {
  return (
    typeof value === 'string' && PAGE_STYLE_ALLOWED_PROPERTIES.includes(value as PageStyleProperty)
  );
}

export function isPageStyleInspectorTab(value: unknown): value is PageStyleInspectorTab {
  return (
    value === PAGE_STYLE_INSPECTOR_TABS.PROPERTIES ||
    value === PAGE_STYLE_INSPECTOR_TABS.RULES ||
    value === PAGE_STYLE_INSPECTOR_TABS.TEMPLATES
  );
}
