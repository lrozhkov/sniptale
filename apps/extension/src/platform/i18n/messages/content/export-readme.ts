import { defineMessageSource } from '../source';

export const contentExportReadmeMessages = defineMessageSource({
  title: {
    ru: 'Экспорт Sniptale',
    en: 'Sniptale export',
  },
  intro: {
    ru: 'Архив содержит выбранные материалы страницы. Ниже описано только фактически сохранённое содержимое.',
    en: 'This archive contains the selected page materials. Only the content actually saved is described below.',
  },
  sourcePageSection: {
    ru: 'Исходная страница',
    en: 'Source page',
  },
  sourcePageAddress: {
    ru: 'Адрес',
    en: 'Address',
  },
  sourcePagePrivacyNote: {
    ru: 'В README адрес приводится без учётных данных, query-параметров и fragment. Потенциально секретный сегмент пути также скрывается.',
    en: 'The README shows the address without credentials, query parameters, or fragments. Potentially secret path segments are also hidden.',
  },
  contents: {
    ru: 'Содержимое',
    en: 'Contents',
  },
  reportSection: {
    ru: 'Отчёт Design Review',
    en: 'Design Review report',
  },
  pageDataSection: {
    ru: 'Данные страницы',
    en: 'Page data',
  },
  mediaSection: {
    ru: 'Снимки и вложения',
    en: 'Captures and attachments',
  },
  diagnosticsSection: {
    ru: 'Диагностика',
    en: 'Diagnostics',
  },
  additionalSection: {
    ru: 'Дополнительные файлы',
    en: 'Additional files',
  },
  annotationsDescription: {
    ru: 'комментарии, действия и изменённые свойства Design Review в Markdown',
    en: 'Design Review comments, actions, and changed properties in Markdown',
  },
  jsonDescription: {
    ru: 'структурированные данные страницы в JSON',
    en: 'structured page data in JSON',
  },
  markdownDescription: {
    ru: 'читаемое представление данных страницы в Markdown',
    en: 'readable page data in Markdown',
  },
  filesDescription: {
    ru: 'скачанные файлы и изображения, на которые ссылаются данные страницы',
    en: 'downloaded files and images referenced by the page data',
  },
  screenshotDescription: {
    ru: 'снимок страницы целиком',
    en: 'full-page screenshot',
  },
  diagnosticsDescription: {
    ru: 'логи, диагностические данные и предупреждения экспорта',
    en: 'logs, diagnostic data, and export warnings',
  },
  diagnosticsSanitizationTitle: {
    ru: 'Как подготовлены диагностические данные',
    en: 'How diagnostic data is prepared',
  },
  diagnosticsCaptureNote: {
    ru: 'В архив попадают только выбранные материалы текущего сканирования страницы: метаданные и трассировка парсера, очищенная консоль, выбранные DOM/HAR-данные, CSS-диагностика и предупреждения экспорта. Полная история браузера не снимается.',
    en: 'The archive contains only selected data from the current page scan: parser metadata and traces, sanitized console data, selected DOM/HAR data, CSS diagnostics, and export warnings. The complete browser history is not captured.',
  },
  diagnosticsRedactionNote: {
    ru: 'Значения полей, похожих на секреты, идентификаторы сессий, текст, value и HTML, а также credentials и подписи заменяются маской `***`; чрезмерно глубокие структуры обрезаются.',
    en: 'Values in fields associated with secrets, session identifiers, text, value, and HTML, plus credentials and signatures, are replaced with `***`; excessively deep structures are truncated.',
  },
  diagnosticsUrlNote: {
    ru: 'В обычной диагностике из URL удаляются query и fragment. В raw-логах безопасные query-параметры могут сохраняться, но credentials и чувствительные параметры авторизации, кода, email, ключей и токенов маскируются, а fragment удаляется.',
    en: 'Regular diagnostic URLs have query strings and fragments removed. Raw logs may retain safe query parameters, but credentials and sensitive authorization, code, email, key, and token parameters are redacted, and fragments are removed.',
  },
  additionalDescription: {
    ru: 'дополнительный материал экспорта',
    en: 'additional export material',
  },
  noAdditionalFiles: {
    ru: 'Дополнительные файлы в архив не включены.',
    en: 'No additional files were included in the archive.',
  },
});
