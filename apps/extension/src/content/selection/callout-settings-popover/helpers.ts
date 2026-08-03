import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import { normalizeCalloutSettings as normalizeCalloutModel } from '../callout/model';

export const POPOVER_WIDTH = 320;
export const POPOVER_HEIGHT = 680;

export function normalizeCalloutSettings(settings?: CalloutSettings): CalloutSettings {
  return normalizeCalloutModel(settings);
}
