import { defineMessageSource } from '../source';

export const galleryRecoveryMessages = defineMessageSource({
  checkingTitle: {
    ru: 'Проверяем локальные данные',
    en: 'Checking local data',
  },
  checkingBody: {
    ru: 'Библиотека откроется после проверки формата и незавершённых переходов.',
    en: 'The library will open after format and interrupted-transition checks finish.',
  },
  blockedTitle: {
    ru: 'Переход хранилища заблокирован',
    en: 'Storage transition is blocked',
  },
  blockedBody: {
    ru: 'Закройте другие окна Sniptale и повторите проверку.',
    en: 'Close other Sniptale windows and retry the check.',
  },
  corruptTitle: {
    ru: 'Формат локальных данных повреждён',
    en: 'Local data format is corrupt',
  },
  corruptBody: {
    ru: 'Sniptale не будет изменять эти данные автоматически. Можно повторить проверку или явно сбросить локальную библиотеку.',
    en: 'Sniptale will not change this data automatically. Retry the check or explicitly reset the local library.',
  },
  unsupportedTitle: {
    ru: 'Формат данных не поддерживается этой версией',
    en: 'This data format is not supported by this version',
  },
  unsupportedBody: {
    ru: 'Обновите расширение. Если совместимая версия недоступна, локальную библиотеку можно сбросить вручную.',
    en: 'Update the extension. If no compatible version is available, you can reset the local library manually.',
  },
  spaceTitle: {
    ru: 'Недостаточно места для обновления данных',
    en: 'Not enough space to update data',
  },
  spaceBody: {
    ru: 'Освободите место и повторите проверку. До этого Sniptale не начнёт преобразование.',
    en: 'Free some storage and retry. Sniptale will not start the transformation before then.',
  },
  requiredSpace: {
    ru: 'Требуется',
    en: 'Required',
  },
  availableSpace: {
    ru: 'Доступно',
    en: 'Available',
  },
  backupTitle: {
    ru: 'Перед обновлением требуется backup',
    en: 'A backup is required before updating',
  },
  backupBody: {
    ru: 'Автоматическое преобразование отключено, пока исходная версия не предоставит полный подтверждённый экспорт.',
    en: 'Automatic transformation is disabled until the source version provides a complete confirmed export.',
  },
  retry: {
    ru: 'Проверить снова',
    en: 'Check again',
  },
  reset: {
    ru: 'Сбросить локальные данные',
    en: 'Reset local data',
  },
  resetTitle: {
    ru: 'Сбросить локальную библиотеку?',
    en: 'Reset the local library?',
  },
  resetBody: {
    ru: 'Проекты, медиа, snapshots, diagnostics и связанные локальные файлы будут удалены без возможности восстановления. Настройки сохранятся.',
    en: 'Projects, media, snapshots, diagnostics, and related local files will be permanently removed. Settings will be kept.',
  },
  resetFailed: {
    ru: 'Сброс не завершён. Часть данных могла быть удалена. Повторите сброс, чтобы безопасно завершить очистку.',
    en: 'The reset did not finish. Some data may already be deleted. Retry the reset to safely complete cleanup.',
  },
  resetIncompleteTitle: {
    ru: 'Сброс локальных данных не завершён',
    en: 'Local data reset did not finish',
  },
  cancel: {
    ru: 'Отмена',
    en: 'Cancel',
  },
});
