import type { AppLocale } from '../../../platform/i18n';

export function getAnnotatableImageSurfacePreviewCopy(locale: AppLocale) {
  if (locale === 'ru') {
    return {
      stageLabel: 'Canvas stage',
      toolbarLabel: 'Image toolbar',
      actionLabel: 'Добавить слой',
    };
  }

  return {
    stageLabel: 'Canvas stage',
    toolbarLabel: 'Image toolbar',
    actionLabel: 'Add overlay',
  };
}
