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
      ru: 'Визуальная копия',
      en: 'Visual copy',
    },
    staticDocumentMode: {
      ru: 'Статический документ',
      en: 'Static document',
    },
    visualAlt: {
      ru: 'Сохранённая визуальная копия веб-страницы',
      en: 'Saved visual copy of the web page',
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
