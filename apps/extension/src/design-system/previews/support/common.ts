import type { AppLocale } from '../../../platform/i18n';
import { localizePreviewCopy } from './copy';
import { SHARED_PREVIEW_COPY_VALUES, SHARED_PREVIEW_SELECT_OPTIONS } from './common.data.ts';

function localizeSharedPreviewCopyValues(locale: AppLocale): {
  -readonly [TKey in keyof typeof SHARED_PREVIEW_COPY_VALUES]: string;
} {
  const localized = {} as { -readonly [TKey in keyof typeof SHARED_PREVIEW_COPY_VALUES]: string };
  for (const key of Object.keys(SHARED_PREVIEW_COPY_VALUES) as Array<
    keyof typeof SHARED_PREVIEW_COPY_VALUES
  >) {
    localized[key] = localizePreviewCopy(locale, SHARED_PREVIEW_COPY_VALUES[key]);
  }
  return localized;
}

export function getSharedPreviewCopy(locale: AppLocale) {
  const localizedCopy = localizeSharedPreviewCopyValues(locale);

  return {
    selectOptions: SHARED_PREVIEW_SELECT_OPTIONS.map((option) => ({
      value: option.value,
      label: localizePreviewCopy(locale, option.label),
      description: localizePreviewCopy(locale, option.description),
    })),
    ...localizedCopy,
  };
}
