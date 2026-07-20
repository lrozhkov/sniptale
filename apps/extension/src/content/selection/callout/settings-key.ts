import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';

export function createCalloutSettingsKey(settings: CalloutSettings) {
  return [
    settings.htmlContent,
    settings.maxWidth,
    settings.fontSize,
    settings.fontFamily,
    settings.bgColor,
    settings.textColor,
    settings.tailSize,
    settings.variant,
  ].join('|');
}
