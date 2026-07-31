// policyStateIds: [] - page-style declaration limits are immutable contract policy, not state.
import { PAGE_STYLE_ALLOWED_PROPERTIES } from '@sniptale/runtime-contracts/page-style';

export const PAGE_STYLE_LIMITS = {
  maxCssValueLength: 500,
  maxDeclarationsPerPatch: PAGE_STYLE_ALLOWED_PROPERTIES.length,
} as const;
