import type { DesignSystemRegistryEntry } from '../types';
import { PRODUCT_DESIGN_SYSTEM_GLASS_SURFACES_REGISTRY } from './surfaces/glass.data.ts';
import { PRODUCT_DESIGN_SYSTEM_MENU_SURFACES_REGISTRY } from './surfaces/menus.data.ts';

export const PRODUCT_DESIGN_SYSTEM_SURFACES_REGISTRY: DesignSystemRegistryEntry[] = [
  ...PRODUCT_DESIGN_SYSTEM_MENU_SURFACES_REGISTRY,
  ...PRODUCT_DESIGN_SYSTEM_GLASS_SURFACES_REGISTRY,
];
