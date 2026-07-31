import { defineMessageSource } from '../../source';

export const contentToolbarDesignReviewMessages = defineMessageSource({
  annotationExportMenuTitle: {
    ru: 'Экспорт дизайн-ревью',
    en: 'Export design review',
  },
  annotationExportDownloadLabel: {
    ru: 'Скачать дизайн-ревью',
    en: 'Download design review',
  },
  annotationExportDownloadHint: {
    ru: 'Скачать комментарии, действия и изменённые свойства без снимка страницы',
    en: 'Download comments, actions, and changed properties without a screenshot',
  },
  annotationExportCopyLabel: {
    ru: 'Копировать дизайн-ревью',
    en: 'Copy design review',
  },
  annotationExportCopyHint: {
    ru: 'Скопировать комментарии, действия и изменённые свойства',
    en: 'Copy comments, actions, and changed properties',
  },
  annotationExportOpenLabel: {
    ru: 'Экспорт страницы',
    en: 'Export page',
  },
  annotationExportOpenHint: {
    ru: 'Открыть полный экспорт страницы со всеми параметрами',
    en: 'Open full page export with all options',
  },
  annotationExportDownloadSuccess: {
    ru: 'Дизайн-ревью отправлено в загрузки',
    en: 'Design review sent to Downloads',
  },
  annotationExportCopySuccess: {
    ru: 'Дизайн-ревью скопировано',
    en: 'Design review copied',
  },
  annotationExportOpenSuccess: {
    ru: 'Открыт экспорт страницы',
    en: 'Page export opened',
  },
  annotationExportCopyError: {
    ru: 'Не удалось скопировать дизайн-ревью. Проверьте доступ к буферу обмена.',
    en: 'Could not copy the design review. Check clipboard access.',
  },
  annotationExportDownloadError: {
    ru: 'Не удалось скачать дизайн-ревью. Попробуйте ещё раз.',
    en: 'Could not download the design review. Try again.',
  },
  annotationExportOpenError: {
    ru: 'Не удалось открыть экспорт страницы. Попробуйте ещё раз.',
    en: 'Could not open page export. Try again.',
  },
});
