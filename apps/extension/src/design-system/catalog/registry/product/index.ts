import type { DesignSystemRegistryEntry } from '../types';
import { PRODUCT_DESIGN_SYSTEM_FEEDBACK_REGISTRY } from './feedback.data.ts';
import { PRODUCT_DESIGN_SYSTEM_MODAL_REGISTRY } from './modal.data.ts';
import { PRODUCT_DESIGN_SYSTEM_SURFACES_REGISTRY } from './surfaces.data.ts';

export const PRODUCT_DESIGN_SYSTEM_REGISTRY: DesignSystemRegistryEntry[] = [
  ...PRODUCT_DESIGN_SYSTEM_MODAL_REGISTRY,
  ...PRODUCT_DESIGN_SYSTEM_SURFACES_REGISTRY,
  ...PRODUCT_DESIGN_SYSTEM_FEEDBACK_REGISTRY,
];
