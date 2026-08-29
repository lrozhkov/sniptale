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
      ru: 'Вложения',
      en: 'Attachments',
    },
    assetsTitle: {
      ru: 'Вложения снимка',
      en: 'Snapshot attachments',
    },
    assetsDescription: {
      ru: 'Проверенные локальные файлы, которые использует статический документ.',
      en: 'Verified local files used by the static document.',
    },
    assetsEmpty: {
      ru: 'В этом снимке нет сохранённых вложений.',
      en: 'This snapshot has no saved attachments.',
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
    downloadAsset: {
      ru: 'Скачать оригинал',
      en: 'Download original',
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
    pngDprHint: {
      ru: 'Скриншот показан в исходном качестве. Масштаб меняет только размер просмотра.',
      en: 'The screenshot is shown at its original quality. Zoom only changes the viewing size.',
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
