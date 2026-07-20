import type { CSSProperties } from 'react';
import { translate } from '../../../platform/i18n';
import type {
  CalloutSettings,
  CalloutVariant,
} from '@sniptale/runtime-contracts/highlighter/callout';

const POPOVER_WIDTH = 320;
const POPOVER_HEIGHT = 560;
const POPOVER_MARGIN = 8;

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

export function getCalloutSettingsPopoverStyle(anchorEl: HTMLElement | null): CSSProperties {
  if (!anchorEl) {
    return {
      position: 'fixed',
      top: 0,
      left: 0,
      visibility: 'hidden',
      pointerEvents: 'none',
    };
  }

  const rect = anchorEl.getBoundingClientRect();

  let top = rect.bottom + POPOVER_MARGIN;
  let left = rect.left;

  if (top + POPOVER_HEIGHT > window.innerHeight) {
    top = rect.top - POPOVER_HEIGHT - POPOVER_MARGIN;
  }

  if (left + POPOVER_WIDTH > window.innerWidth) {
    left = window.innerWidth - POPOVER_WIDTH - POPOVER_MARGIN;
  }

  return {
    position: 'fixed',
    top: Math.max(POPOVER_MARGIN, top),
    left: Math.max(POPOVER_MARGIN, left),
    zIndex: 2147483647,
    pointerEvents: 'auto',
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
