import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';

export function createCalloutSettingsKey(settings: CalloutSettings) {
  return [
    settings.content.bodyHtml,
    settings.content.titleText,
    settings.style.typography.maxWidth,
    settings.style.typography.fontSize,
    settings.style.typography.fontFamily,
    settings.style.typography.textAlign,
    JSON.stringify(settings.style.surface.fillPaint),
    settings.style.customCss,
    settings.style.surface.textColor,
    settings.style.surface.paddingX,
    settings.style.surface.paddingY,
    settings.style.surface.borderWidth,
    settings.style.title.enabled,
    settings.style.title.fontSize,
    settings.style.title.dividerWidth,
  ].join('|');
}
