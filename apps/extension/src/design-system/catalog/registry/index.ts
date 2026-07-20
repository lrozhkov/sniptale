import { DESIGN_TOKEN_GROUPS } from './token-groups';
import { PRODUCT_DESIGN_SYSTEM_REGISTRY } from './product/index';
import { SHARED_DESIGN_SYSTEM_REGISTRY } from './shared/index';

export const DESIGN_SYSTEM_REGISTRY = [
  ...SHARED_DESIGN_SYSTEM_REGISTRY,
  ...PRODUCT_DESIGN_SYSTEM_REGISTRY,
];

export { DESIGN_TOKEN_GROUPS };
export type {
  DesignSystemEntryKind,
  DesignSystemEntryScope,
  DesignSystemEntryStatus,
  DesignSystemPreviewFidelity,
  DesignSystemRegistryEntry,
  DesignSystemUsageContext,
  DesignSystemUsageStatus,
  DesignSystemVariantSpec,
  DesignTokenGroup,
} from './types';
