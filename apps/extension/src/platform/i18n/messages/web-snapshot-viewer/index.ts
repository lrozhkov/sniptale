import { defineMessageSource } from '../source';
import {
  sharedWebSnapshotProductNameMessage,
  sharedWebSnapshotSingularNameMessage,
} from '../shared/web-snapshot';

export const webSnapshotViewerMessages = defineMessageSource({
  app: {
    documentTitleFallback: sharedWebSnapshotProductNameMessage,
    documentTitleSuffix: sharedWebSnapshotProductNameMessage,
    frameTitle: sharedWebSnapshotSingularNameMessage,
    modeLabel: {
      ru: 'Режим просмотра веб-снимка',
      en: 'Web snapshot view mode',
    },
    visualMode: {
      ru: 'Скриншот',
      en: 'Screenshot',
    },
    staticDocumentMode: {
      ru: 'Статический документ',
      en: 'Static document',
    },
    assetsMode: {
      ru: 'Файлы',
      en: 'Files',
    },
    assetsTitle: {
      ru: 'Файлы снимка',
      en: 'Snapshot files',
    },
    assetsDescription: {
      ru: 'Извлечённые изображения, вложения и локальные ресурсы статического документа.',
      en: 'Extracted images, attachments, and local resources used by the static document.',
    },
    assetsEmpty: {
      ru: 'В этом снимке нет сохранённых файлов.',
      en: 'This snapshot has no saved files.',
    },
    assetImages: {
      ru: 'Изображения',
      en: 'Images',
    },
    assetFonts: {
      ru: 'Шрифты',
      en: 'Fonts',
    },
    assetStyles: {
      ru: 'Стили',
      en: 'Styles',
    },
    assetOther: {
      ru: 'Другие файлы',
      en: 'Other files',
    },
    exportedImages: {
      ru: 'Изображения страницы',
      en: 'Page images',
    },
    downloadedAttachments: {
      ru: 'Вложения',
      en: 'Attachments',
    },
    pageResources: {
      ru: 'Ресурсы веб-копии',
      en: 'Web Copy resources',
    },
    packageFileDownloadFailed: {
      ru: 'Не удалось извлечь файл: содержимое повреждено или не соответствует снимку.',
      en: 'Could not extract the file because it is damaged or does not match the snapshot.',
    },
    downloadAsset: {
      ru: 'Скачать оригинал',
      en: 'Download original',
    },
    exportActions: {
      ru: 'Скачать и экспортировать',
      en: 'Download and export',
    },
    downloadPackage: {
      ru: 'Скачать исходный архив',
      en: 'Download original archive',
    },
    downloadScreenshot: {
      ru: 'Скачать исходный скриншот',
      en: 'Download original screenshot',
    },
    exportPdf: {
      ru: 'Экспортировать в PDF',
      en: 'Export to PDF',
    },
    exportPdfFailed: {
      ru: 'Не удалось подготовить PDF. Попробуйте ещё раз.',
      en: 'Could not prepare the PDF. Try again.',
    },
    externalLinks: {
      ru: 'Ссылки',
      en: 'Links',
    },
    enableExternalLinks: {
      ru: 'Разрешить переходы по ссылкам',
      en: 'Allow opening links',
    },
    disableExternalLinks: {
      ru: 'Запретить переходы по ссылкам',
      en: 'Block opening links',
    },
    externalLinkDestination: {
      ru: 'Адрес ссылки',
      en: 'Link destination',
    },
    visualAlt: {
      ru: 'Сохранённый скриншот веб-страницы',
      en: 'Saved screenshot of the web page',
    },
    partialScreenshotNotice: {
      ru: 'Сохранена только видимая область. Статический документ и вложения доступны полностью в пределах собранных данных.',
      en: 'Only the visible area was saved. The static document and attachments remain available for the collected content.',
    },
    collapseToolbar: {
      ru: 'Свернуть панель',
      en: 'Collapse toolbar',
    },
    expandToolbar: {
      ru: 'Развернуть панель',
      en: 'Expand toolbar',
    },
    zoomControls: {
      ru: 'Масштаб снимка',
      en: 'Snapshot zoom',
    },
    zoomIn: {
      ru: 'Увеличить',
      en: 'Zoom in',
    },
    zoomOut: {
      ru: 'Уменьшить',
      en: 'Zoom out',
    },
    actualSize: {
      ru: 'Масштаб 100%',
      en: 'Actual size (100%)',
    },
    fitToWidth: {
      ru: 'По ширине окна',
      en: 'Fit to window width',
    },
    loading: {
      ru: 'Загрузка снимка...',
      en: 'Loading snapshot...',
    },
    missingSnapshotId: {
      ru: 'Не найден идентификатор снимка.',
      en: 'Missing snapshot id.',
    },
  },
});
