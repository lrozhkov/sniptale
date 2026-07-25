import { translate } from '../../../platform/i18n';
import type {
  CalloutSettings,
  CalloutVariant,
} from '@sniptale/runtime-contracts/highlighter/callout';

export const POPOVER_WIDTH = 320;
export const POPOVER_HEIGHT = 560;

const DEFAULT_CALLOUT_SETTINGS: CalloutSettings = {
  enabled: true,
  htmlContent: '',
  anchor: 'top-center',
  side: 'auto',
  variant: 'bubble',
  bgColor: 'var(--sniptale-color-surface-panel)',
  textColor: 'var(--sniptale-color-text-primary)',
  tailSize: 8,
  fontFamily: 'sans',
  fontWeight: 'normal',
  fontSize: 14,
  maxWidth: 200,
};

export function normalizeCalloutSettings(settings?: CalloutSettings): CalloutSettings {
  if (!settings) {
    return { ...DEFAULT_CALLOUT_SETTINGS };
  }

  return {
    ...DEFAULT_CALLOUT_SETTINGS,
    ...settings,
  };
}

export function createCalloutVariantOptions(): {
  value: CalloutVariant;
  label: string;
}[] {
  return [
    { value: 'bubble', label: translate('content.callout.variantBubble') },
    { value: 'rect', label: translate('content.callout.variantRect') },
    { value: 'text-only', label: translate('content.callout.variantTextOnly') },
  ];
}
