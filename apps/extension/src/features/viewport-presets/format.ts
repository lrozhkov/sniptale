import { formatNumber } from '../../platform/i18n';
import type { AppLocale } from '../../platform/i18n';

export function formatViewportPresetDimensions(
  width: number,
  height: number,
  locale?: AppLocale
): string {
  return `${formatNumber(width, undefined, locale)} × ${formatNumber(height, undefined, locale)}`;
}
