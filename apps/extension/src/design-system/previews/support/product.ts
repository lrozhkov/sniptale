import { DESIGN_SYSTEM_PREVIEW_HOSTNAME } from '@sniptale/ui/branding';
import type { AppLocale } from '../../../platform/i18n';
import { localizePreviewCopy } from './copy';
import { PRODUCT_PREVIEW_COPY_KEYS, PRODUCT_PREVIEW_COPY_VALUES } from './product.data.ts';

type ProductPreviewCopy = Record<(typeof PRODUCT_PREVIEW_COPY_KEYS)[number], string>;

function localizeProductPreviewCopyValues(locale: AppLocale): ProductPreviewCopy {
  const localized = {} as ProductPreviewCopy;
  for (const key of PRODUCT_PREVIEW_COPY_KEYS) {
    localized[key] = localizePreviewCopy(locale, PRODUCT_PREVIEW_COPY_VALUES[key]);
  }
  return localized;
}

export function getProductPreviewCopy(locale: AppLocale) {
  const localizedEntries = localizeProductPreviewCopyValues(locale);

  return {
    ...localizedEntries,
    saveDialogFilenameValue: 'Screenshot.png',
    saveDialogFilenamePlaceholder: 'Screenshot.png',
    formInputValue: DESIGN_SYSTEM_PREVIEW_HOSTNAME,
    presetA: 'Preset A',
    presetB: 'Preset B',
  };
}
