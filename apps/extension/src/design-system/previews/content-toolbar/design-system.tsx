import type { AppLocale } from '../../../platform/i18n';
import { getSharedPreviewCopy } from '../support/common';
import type { DesignSystemVariantPreview } from '../support/provider';
import {
  buildToolbarButtonPreviews,
  buildToolbarChromePreviews,
  buildToolbarShellPreview,
} from './previews';

export function buildContentToolbarSharedPreviews(locale: AppLocale): DesignSystemVariantPreview[] {
  const copy = getSharedPreviewCopy(locale);

  return [
    buildToolbarShellPreview(),
    ...buildToolbarChromePreviews(copy),
    ...buildToolbarButtonPreviews(copy),
  ];
}
