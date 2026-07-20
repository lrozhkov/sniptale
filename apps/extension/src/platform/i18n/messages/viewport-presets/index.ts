import { defineMessageSource } from '../source';

export const viewportPresetsMessages = defineMessageSource({
  section: {
    subtitle: {
      ru: 'Настройка размеров viewport для стандартизации скриншотов',
      en: 'Viewport size setup for standardized screenshots',
    },
    defaultLabel: {
      ru: 'Размер экрана по умолчанию',
      en: 'Default screen size',
    },
    nativeOption: {
      ru: 'Без эмуляции (нативный)',
      en: 'No emulation (native)',
    },
    defaultHint: {
      ru: 'Размер экрана при включении режима скриншота',
      en: 'Screen size when screenshot mode is enabled',
    },
    savedLabel: {
      ru: 'Сохранённые пресеты',
      en: 'Saved presets',
    },
    emptyTitle: {
      ru: 'Нет сохранённых пресетов',
      en: 'No saved presets',
    },
    emptyDescription: {
      ru: 'Добавьте пресет для быстрого переключения размеров экрана',
      en: 'Add a preset for quick screen size switching',
    },
    addButton: {
      ru: 'Добавить пресет',
      en: 'Add preset',
    },
    deleteTitle: {
      ru: 'Удалить пресет?',
      en: 'Delete preset?',
    },
    deleteMessagePrefix: {
      ru: 'Вы уверены, что хотите удалить пресет',
      en: 'Are you sure you want to delete the preset',
    },
    deleteMessageSuffix: {
      ru: '?',
      en: '?',
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
      ru: 'Например: Desktop HD',
      en: 'Example: Desktop HD',
    },
    widthLabel: {
      ru: 'Ширина',
      en: 'Width',
    },
    heightLabel: {
      ru: 'Высота',
      en: 'Height',
    },
    saving: {
      ru: 'Сохранение...',
      en: 'Saving...',
    },
    create: {
      ru: 'Создать',
      en: 'Create',
    },
  },
  messages: {
    defaultUpdated: {
      ru: 'Размер экрана по умолчанию обновлён',
      en: 'Default screen size updated',
    },
    presetUpdated: {
      ru: 'Пресет обновлён',
      en: 'Preset updated',
    },
    presetCreated: {
      ru: 'Пресет создан',
      en: 'Preset created',
    },
    presetDeleted: {
      ru: 'Пресет удалён',
      en: 'Preset deleted',
    },
  },
});
