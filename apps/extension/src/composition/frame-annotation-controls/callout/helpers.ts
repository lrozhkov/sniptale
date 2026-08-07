import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';

import { normalizeCalloutSettings as normalizeCalloutModel } from '../../../features/highlighter/frame-annotation/callout/model';

export const POPOVER_WIDTH = 400;
export const POPOVER_HEIGHT = 600;

export function normalizeCalloutSettings(settings?: CalloutSettings): CalloutSettings {
  return normalizeCalloutModel(settings);
}
