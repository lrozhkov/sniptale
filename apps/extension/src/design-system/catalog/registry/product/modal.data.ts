import type { DesignSystemRegistryEntry } from '../types';
import { PRODUCT_DESIGN_SYSTEM_FORM_CONTROLS_REGISTRY } from './form-controls.data.ts';
import { PRODUCT_DESIGN_SYSTEM_MODAL_ACTIONS_REGISTRY } from './modal-actions.data.ts';
import { PRODUCT_DESIGN_SYSTEM_MODAL_SHELL_REGISTRY } from './modal-shell.data.ts';

export const PRODUCT_DESIGN_SYSTEM_MODAL_REGISTRY: DesignSystemRegistryEntry[] = [
  ...PRODUCT_DESIGN_SYSTEM_MODAL_SHELL_REGISTRY,
  ...PRODUCT_DESIGN_SYSTEM_FORM_CONTROLS_REGISTRY,
  ...PRODUCT_DESIGN_SYSTEM_MODAL_ACTIONS_REGISTRY,
];
