import { defineMessageSource } from '../source';

const SAVE_TO_GALLERY_DESCRIPTION_RU = [
  'Скриншот попадёт во внутренний Media Hub независимо от выбранного действия:',
  'скачать, открыть в редакторе или копировать.',
].join(' ');

const SAVE_TO_GALLERY_DESCRIPTION_EN = [
  'The screenshot will be added to the internal Media Hub regardless of the chosen action:',
  'download, open in editor, or copy.',
].join(' ');

export const savePresetsMessages = defineMessageSource({
  section: {
    title: {
      ru: 'Сохранение файлов',
      en: 'File saving',
    },
    subtitle: {
      ru: 'Пресеты папок внутри Downloads и действие после захвата',
      en: 'Folder presets inside Downloads and the action after capture',
    },
    captureActionLabel: {
      ru: 'Действие после захвата',
      en: 'Action after capture',
    },
    saveToGalleryLabel: {
      ru: 'Дополнительно сохранять в Галерею',
      en: 'Also save to Gallery',
    },
    saveToGalleryDescription: {
      ru: SAVE_TO_GALLERY_DESCRIPTION_RU,
      en: SAVE_TO_GALLERY_DESCRIPTION_EN,
    },
    galleryToggleOnTitle: {
      ru: 'Отключить сохранение в Галерею',
      en: 'Disable Gallery saving',
    },
    galleryToggleOffTitle: {
      ru: 'Включить сохранение в Галерею',
      en: 'Enable Gallery saving',
    },
    defaultPresetsLabel: {
      ru: 'Пресеты по умолчанию',
      en: 'Default presets',
    },
    imagePresetLabel: {
      ru: 'Изображения',
      en: 'Images',
    },
    videoPresetLabel: {
      ru: 'Видео',
      en: 'Video',
    },
    exportPresetLabel: {
      ru: 'Экспорт (ZIP)',
      en: 'Export (ZIP)',
    },
    folderPresetsLabel: {
      ru: 'Пресеты папок',
      en: 'Folder presets',
    },
    emptyTitle: {
      ru: 'Нет пресетов',
      en: 'No presets',
    },
    emptyDescription: {
      ru: 'Добавьте папку для сохранения скриншотов и видео',
      en: 'Add a folder for saving screenshots and videos',
    },
    addButton: {
      ru: 'Добавить пресет',
      en: 'Add preset',
    },
    unsetOption: {
      ru: 'Не задан',
      en: 'Not set',
    },
    countOne: {
      ru: 'пресет',
      en: 'preset',
    },
    countFew: {
      ru: 'пресета',
      en: 'presets',
    },
    countMany: {
      ru: 'пресетов',
      en: 'presets',
    },
    deleteTitle: {
      ru: 'Удалить пресет?',
      en: 'Delete preset?',
    },
    deleteMessagePrefix: {
      ru: 'Пресет',
      en: 'Preset',
    },
    deleteMessageSuffix: {
      ru: 'будет удалён.',
      en: 'will be deleted.',
    },
    toggleHiddenTitle: {
      ru: 'Скрыть из диалога',
      en: 'Hide from dialog',
    },
    toggleShownTitle: {
      ru: 'Показывать в диалоге',
      en: 'Show in dialog',
    },
    captureActionDownloadDefault: {
      ru: 'Сохранять в папку по умолчанию',
      en: 'Save to the default folder',
    },
    captureActionAskPreset: {
      ru: 'Выбор пресета',
      en: 'Choose preset',
    },
    captureActionAskSystem: {
      ru: 'Сохранить как... (системный диалог)',
      en: 'Save as... (system dialog)',
    },
    captureActionEdit: {
      ru: 'Открыть в редакторе',
      en: 'Open in editor',
    },
    captureActionCopy: {
      ru: 'Копировать в буфер обмена',
      en: 'Copy to clipboard',
    },
  },
  editor: {
    editTitle: {
      ru: 'Редактировать пресет',
      en: 'Edit preset',
    },
    newTitle: {
      ru: 'Новый пресет',
      en: 'New preset',
    },
    nameLabel: {
      ru: 'Название',
      en: 'Name',
    },
    namePlaceholder: {
      ru: 'Например: Отчёты',
      en: 'Example: Reports',
    },
    pathLabel: {
      ru: 'Путь (внутри Downloads)',
      en: 'Path (inside Downloads)',
    },
    pathPlaceholder: {
      ru: 'Sniptale/Reports',
      en: 'Sniptale/Reports',
    },
    pathHint: {
      ru: 'Не используйте: : * ? " < > | \\ ..',
      en: 'Do not use: : * ? " < > | \\ ..',
    },
    downloadsPrefix: {
      ru: '[ Загрузки /',
      en: '[ Downloads /',
    },
    downloadsSuffix: {
      ru: ']',
      en: ']',
    },
    enabledLabel: {
      ru: 'Включён (показывать в диалоге выбора)',
      en: 'Enabled (show in the picker dialog)',
    },
  },
  messages: {
    captureActionUpdated: {
      ru: 'Действие после захвата обновлено',
      en: 'Action after capture updated',
    },
    saveToGalleryEnabled: {
      ru: 'Сохранение в Галерею включено',
      en: 'Gallery saving enabled',
    },
    saveToGalleryDisabled: {
      ru: 'Сохранение в Галерею отключено',
      en: 'Gallery saving disabled',
    },
    defaultImageUpdated: {
      ru: 'Пресет по умолчанию для изображений обновлён',
      en: 'Default image preset updated',
    },
    defaultVideoUpdated: {
      ru: 'Пресет по умолчанию для видео обновлён',
      en: 'Default video preset updated',
    },
    defaultExportUpdated: {
      ru: 'Пресет по умолчанию для экспорта обновлён',
      en: 'Default export preset updated',
    },
    nameRequired: {
      ru: 'Введите название пресета',
      en: 'Enter a preset name',
    },
    presetUpdated: {
      ru: 'Пресет обновлён',
      en: 'Preset updated',
    },
    presetCreated: {
      ru: 'Пресет создан',
      en: 'Preset created',
    },
    presetHidden: {
      ru: 'Пресет скрыт из диалога',
      en: 'Preset hidden from the dialog',
    },
    presetShown: {
      ru: 'Пресет отображается в диалоге',
      en: 'Preset shown in the dialog',
    },
    presetInUseError: {
      ru: 'Пресет используется в настройках по умолчанию или Быстрых действиях',
      en: 'Preset is used in default settings or Quick Actions',
    },
    presetDeleted: {
      ru: 'Пресет удалён',
      en: 'Preset deleted',
    },
  },
});
