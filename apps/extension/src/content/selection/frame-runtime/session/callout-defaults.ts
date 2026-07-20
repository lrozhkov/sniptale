import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import {
  DEFAULT_COLOR_TEXT_INVERSE,
  DEFAULT_COLOR_TEXT_PANEL,
} from '@sniptale/ui/default-colors/constants';

const DEFAULT_CALLOUT_SETTINGS: CalloutSettings = {
  anchor: 'top-center',
  bgColor: DEFAULT_COLOR_TEXT_PANEL,
  enabled: false,
  fontFamily: 'sans',
  fontSize: 14,
  fontWeight: 'normal',
  htmlContent: '',
  maxWidth: 200,
  side: 'auto',
  tailSize: 8,
  textColor: DEFAULT_COLOR_TEXT_INVERSE,
  variant: 'bubble',
};

export function createDefaultCalloutSettings(template?: Partial<CalloutSettings>): CalloutSettings {
  return {
    ...DEFAULT_CALLOUT_SETTINGS,
    anchor: template?.anchor ?? DEFAULT_CALLOUT_SETTINGS.anchor,
    bgColor: template?.bgColor ?? DEFAULT_CALLOUT_SETTINGS.bgColor,
    fontFamily: template?.fontFamily ?? DEFAULT_CALLOUT_SETTINGS.fontFamily,
    fontSize: template?.fontSize ?? DEFAULT_CALLOUT_SETTINGS.fontSize,
    fontWeight: template?.fontWeight ?? DEFAULT_CALLOUT_SETTINGS.fontWeight,
    maxWidth: template?.maxWidth ?? DEFAULT_CALLOUT_SETTINGS.maxWidth,
    side: template?.side ?? DEFAULT_CALLOUT_SETTINGS.side,
    tailSize: template?.tailSize ?? DEFAULT_CALLOUT_SETTINGS.tailSize,
    textColor: template?.textColor ?? DEFAULT_CALLOUT_SETTINGS.textColor,
    variant: template?.variant ?? DEFAULT_CALLOUT_SETTINGS.variant,
    enabled: true,
    htmlContent: '',
  };
}
