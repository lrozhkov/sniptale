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
    hideHeader: {
      ru: 'Скрыть заголовок снимка',
      en: 'Hide snapshot header',
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
