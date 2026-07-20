import { browserStorage } from '../../../../composition/persistence/infrastructure/browser-storage';
import { createLogger } from '@sniptale/platform/observability/logger';
import { parseStoredSaveAsDirectory } from './guards';

const LAST_SAVE_AS_DIR_KEY = 'sniptale_last_save_as_dir';
const logger = createLogger({ namespace: 'SharedSaveAsDirectoryStorage' });

/**
 * Сохраняет последнюю выбранную папку для «Сохранить как…» (относительный путь внутри Downloads).
 */
export function setLastSaveAsDirectory(dir: string): void {
  const parsedDirectory = parseStoredSaveAsDirectory(dir);

  if (parsedDirectory.hasInvalidValue) {
    logger.warn('Ignoring invalid save-as directory before persisting');
    return;
  }

  void browserStorage.local
    .set({ [LAST_SAVE_AS_DIR_KEY]: parsedDirectory.value })
    .catch((error) => {
      logger.warn('Failed to persist last save-as directory', error);
    });
}

/**
 * Загружает последнюю папку для «Сохранить как…». Возвращает пустую строку, если не задана или путь абсолютный.
 */
export function getLastSaveAsDirectory(): Promise<string> {
  return browserStorage.local.get([LAST_SAVE_AS_DIR_KEY]).then((result) => {
    const parsedDirectory = parseStoredSaveAsDirectory(result[LAST_SAVE_AS_DIR_KEY]);

    if (parsedDirectory.hasInvalidValue) {
      logger.warn('Ignoring invalid persisted save-as directory');
    }

    return parsedDirectory.value;
  });
}
