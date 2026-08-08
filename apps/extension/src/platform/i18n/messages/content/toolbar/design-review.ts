import { defineMessageSource } from '../../source';

export const contentToolbarDesignReviewMessages = defineMessageSource({
  annotationExportMenuTitle: {
    ru: 'Экспорт дизайн-ревью',
    en: 'Export design review',
  },
  annotationExportDownloadLabel: {
    ru: 'Скачать отчёт',
    en: 'Download report',
  },
  annotationExportDownloadHint: {
    ru: 'Скачать комментарии, действия и изменённые свойства без снимка страницы',
    en: 'Download comments, actions, and changed properties without a screenshot',
  },
  annotationExportCopyLabel: {
    ru: 'Копировать отчёт',
    en: 'Copy report',
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
    ru: 'Сразу скачать полный архив страницы со всеми включёнными данными',
    en: 'Download the complete page archive with all included data',
  },
  annotationExportConfigureLabel: {
    ru: 'Настроить экспорт страницы',
    en: 'Configure page export',
  },
  annotationExportConfigureHint: {
    ru: 'Открыть параметры и выбрать содержимое архива',
    en: 'Open settings and choose the archive contents',
  },
  annotationExportDownloadSuccess: {
    ru: 'Отчёт отправлен в загрузки',
    en: 'Report sent to Downloads',
  },
  annotationExportCopySuccess: {
    ru: 'Отчёт скопирован',
    en: 'Report copied',
  },
  annotationExportPageSuccess: {
    ru: 'Полный архив страницы отправлен в загрузки',
    en: 'Complete page archive sent to Downloads',
  },
  annotationExportOpenSuccess: {
    ru: 'Открыт экспорт страницы',
    en: 'Page export opened',
  },
  annotationExportCopyError: {
    ru: 'Не удалось скопировать отчёт. Проверьте доступ к буферу обмена.',
    en: 'Could not copy the report. Check clipboard access.',
  },
  annotationExportDownloadError: {
    ru: 'Не удалось скачать отчёт. Попробуйте ещё раз.',
    en: 'Could not download the report. Try again.',
  },
  annotationExportPageError: {
    ru: 'Не удалось скачать полный архив страницы. Попробуйте ещё раз.',
    en: 'Could not download the complete page archive. Try again.',
  },
  annotationExportOpenError: {
    ru: 'Не удалось открыть экспорт страницы. Попробуйте ещё раз.',
    en: 'Could not open page export. Try again.',
  },
});
