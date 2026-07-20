export type DesignSystemUsageStatus = 'active' | 'planned';
export type DesignSystemEntryStatus = 'active' | 'planned';
export type DesignSystemEntryKind = 'primitive' | 'surface' | 'feedback' | 'composition';
export type DesignSystemEntryScope = 'shared-ui' | 'product-ui';
export type DesignSystemPreviewFidelity = 'canonical' | 'illustrative';

export interface DesignSystemUsageContext {
  usageId: string;
  labelRu: string;
  labelEn: string;
  files: string[];
  status: DesignSystemUsageStatus;
}

export interface DesignSystemVariantSpec {
  variantId: string;
  labelRu: string;
  labelEn: string;
  descriptionRu: string;
  descriptionEn: string;
  technicalNotesRu: string[];
  technicalNotesEn: string[];
}

export interface DesignSystemRegistryEntry {
  componentId: string;
  labelRu: string;
  labelEn: string;
  kind: DesignSystemEntryKind;
  scope: DesignSystemEntryScope;
  source: string;
  sourceFiles: string[];
  descriptionRu: string;
  descriptionEn: string;
  variants: DesignSystemVariantSpec[];
  usageContexts: DesignSystemUsageContext[];
  status: DesignSystemEntryStatus;
  previewFidelity?: DesignSystemPreviewFidelity;
  canonicalImplementation?: string;
  canonicalPreview?: string;
}

export interface DesignTokenGroup {
  tokenGroupId: string;
  labelRu: string;
  labelEn: string;
  source: string;
  items: string[];
}
