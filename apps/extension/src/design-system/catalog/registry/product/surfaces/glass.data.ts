import type { DesignSystemRegistryEntry } from '../../types';
import { PRODUCT_DESIGN_SYSTEM_GLASS_CONTROLS_REGISTRY } from './glass-controls.data.ts';
import { PRODUCT_DESIGN_SYSTEM_GLASS_TOOLBAR_REGISTRY } from './glass-toolbar.data.ts';

export const PRODUCT_DESIGN_SYSTEM_GLASS_SURFACES_REGISTRY: DesignSystemRegistryEntry[] = [
  ...PRODUCT_DESIGN_SYSTEM_GLASS_TOOLBAR_REGISTRY,
  ...PRODUCT_DESIGN_SYSTEM_GLASS_CONTROLS_REGISTRY,
];
