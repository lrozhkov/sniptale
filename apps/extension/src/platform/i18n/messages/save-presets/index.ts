import { defineMessageSource } from '../source';

export const savePresetsMessages = defineMessageSource({
  section: {
    title: {
      ru: 'Сохранение файлов',
      en: 'File saving',
    },
    subtitle: {
      ru: 'Шаблоны папок внутри Downloads и действие после захвата',
      en: 'Folder presets inside Downloads and the action after capture',
    },
    captureActionLabel: {
      ru: 'Действие после захвата',
      en: 'Action after capture',
    },
    afterCaptureTitle: {
      ru: 'После захвата',
      en: 'After capture',
    },
    captureActionDescription: {
      ru: 'Действие по умолчанию для режима подготовки страницы. Быстрое действие может его переопределить.',
      en: 'The default action for page preparation mode. A quick action can override it.',
    },
    downloadsTitle: {
      ru: 'Скачивание',
      en: 'Downloads',
    },
    downloadsDescription: {
      ru: 'Шаблоны папок внутри системной папки Downloads для скачиваемых файлов.',
      en: 'Folder templates inside the system Downloads folder for downloaded files.',
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
      ru: 'Шаблоны папок',
      en: 'Folder presets',
    },
    emptyTitle: {
      ru: 'Нет шаблонов',
      en: 'No presets',
    },
    emptyDescription: {
      ru: 'Добавьте папку для сохранения скриншотов и видео',
      en: 'Add a folder for saving screenshots and videos',
    },
    addButton: {
      ru: 'Добавить шаблон',
      en: 'Add preset',
    },
    searchLabel: { ru: 'Поиск шаблонов', en: 'Search presets' },
    searchPlaceholder: { ru: 'Название или путь', en: 'Name or folder path' },
    noMatches: {
      ru: 'Шаблоны не найдены. Измените запрос.',
      en: 'No matching presets. Try another search.',
    },
    listDescription: {
      ru: 'Папки внутри «Загрузок». Шаблоны по умолчанию выбираются на вкладке «Файлы».',
      en: 'Folders inside Downloads. Choose defaults on the Files tab.',
    },
    imageDefault: { ru: 'По умолчанию: изображения', en: 'Default: images' },
    videoDefault: { ru: 'По умолчанию: видео', en: 'Default: video' },
    exportDefault: { ru: 'По умолчанию: экспорт', en: 'Default: export' },
    unsetOption: {
      ru: 'Не задан',
      en: 'Not set',
    },
    deleteTitle: {
      ru: 'Удалить шаблон?',
      en: 'Delete preset?',
    },
    deleteMessagePrefix: {
      ru: 'Шаблон',
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
      ru: 'Выбор шаблона',
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
    captureActionSaveToLibrary: {
      ru: 'Сохранить в библиотеку',
      en: 'Save to library',
    },
  },
  editor: {
    editTitle: {
      ru: 'Редактировать шаблон',
      en: 'Edit preset',
    },
    newTitle: {
      ru: 'Новый шаблон',
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
      ru: 'Показывать в диалоге выбора',
      en: 'Show in the picker dialog',
    },
    previewLabel: { ru: 'Папка после сохранения', en: 'Folder after saving' },
    previewRoot: { ru: 'Загрузки', en: 'Downloads' },
    previewHint: {
      ru: 'Относительно папки «Загрузки». Имя файла задаётся отдельно.',
      en: 'Relative to Downloads. The file name is set separately.',
    },
    saveFailed: {
      ru: 'Не удалось сохранить шаблон. Проверьте соединение и повторите.',
      en: 'Could not save the preset. Check the connection and try again.',
    },
  },
  messages: {
    captureActionUpdated: {
      ru: 'Действие после захвата обновлено',
      en: 'Action after capture updated',
    },
    defaultImageUpdated: {
      ru: 'Шаблон по умолчанию для изображений обновлён',
      en: 'Default image preset updated',
    },
    defaultVideoUpdated: {
      ru: 'Шаблон по умолчанию для видео обновлён',
      en: 'Default video preset updated',
    },
    defaultExportUpdated: {
      ru: 'Шаблон по умолчанию для экспорта обновлён',
      en: 'Default export preset updated',
    },
    nameRequired: {
      ru: 'Введите название шаблона',
      en: 'Enter a preset name',
    },
    presetUpdated: {
      ru: 'Шаблон обновлён',
      en: 'Preset updated',
    },
    presetCreated: {
      ru: 'Шаблон создан',
      en: 'Preset created',
    },
    presetHidden: {
      ru: 'Шаблон скрыт из диалога',
      en: 'Preset hidden from the dialog',
    },
    presetShown: {
      ru: 'Шаблон отображается в диалоге',
      en: 'Preset shown in the dialog',
    },
    presetInUseError: {
      ru: 'Шаблон используется в настройках по умолчанию или Быстрых действиях',
      en: 'Preset is used in default settings or Quick Actions',
    },
    presetDeleted: {
      ru: 'Шаблон удалён',
      en: 'Preset deleted',
    },
  },
});
