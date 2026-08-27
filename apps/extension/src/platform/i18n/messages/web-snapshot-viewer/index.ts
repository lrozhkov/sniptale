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
      ru: 'Ассеты',
      en: 'Assets',
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
    visualAlt: {
      ru: 'Сохранённый скриншот веб-страницы',
      en: 'Saved screenshot of the web page',
    },
    hideHeader: {
      ru: 'Скрыть заголовок снимка',
      en: 'Hide snapshot header',
    },
    pngDprHint: {
      ru: 'PNG сохраняется с естественной плотностью пикселей экрана (DPR) без подгонки размера.',
      en: 'PNG export keeps the display’s natural pixel density (DPR) without resizing.',
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
