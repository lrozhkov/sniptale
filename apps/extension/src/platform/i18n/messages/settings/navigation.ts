import { defineMessageSource } from '../source';

export const settingsNavigationMessages = defineMessageSource({
  groups: {
    general: {
      ru: 'Общие',
      en: 'General',
    },
    captureSaving: {
      ru: 'Захват и сохранение',
      en: 'Capture and saving',
    },
    stylesTemplates: {
      ru: 'Стили и шаблоны',
      en: 'Styles and templates',
    },
    ai: {
      ru: 'Искусственный интеллект',
      en: 'Artificial intelligence',
    },
    system: {
      ru: 'Система',
      en: 'System',
    },
  },
  interfaceBrowser: {
    ru: 'Интерфейс и браузер',
    en: 'Interface and browser',
  },
  quickActions: {
    ru: 'Быстрые действия',
    en: 'Quick actions',
  },
  screenSizes: {
    ru: 'Размеры экрана',
    en: 'Screen sizes',
  },
  mediaQuality: {
    ru: 'Изображения и видео',
    en: 'Images and video',
  },
  saving: {
    ru: 'Файлы и хранилище',
    en: 'Files and storage',
  },
  storageDrafts: {
    ru: 'Хранилище и черновики',
    en: 'Storage and drafts',
  },
  annotations: {
    ru: 'Рамки и аннотации',
    en: 'Frames and annotations',
  },
  editorResources: {
    ru: 'Инструменты и палитры',
    en: 'Tools and palettes',
  },
  aiConnections: {
    ru: 'Подключения и модели',
    en: 'Connections and models',
  },
  aiPrompts: {
    ru: 'Промпты и шаблоны',
    en: 'Prompts and templates',
  },
  accessData: {
    ru: 'Доступ и данные',
    en: 'Access and data',
  },
  descriptions: {
    interfaceBrowser: {
      ru: 'Настройте тему, язык и поведение браузерных функций.',
      en: 'Configure the theme, language, and browser behavior.',
    },
    quickActions: {
      ru: 'Настройте команды захвата и действия, доступные без открытия редактора.',
      en: 'Configure capture commands and actions available without opening the editor.',
    },
    screenSizes: {
      ru: 'Управляйте готовыми размерами области захвата и значением по умолчанию.',
      en: 'Manage capture-area sizes and choose the default.',
    },
    mediaQuality: {
      ru: 'Настройте параметры изображений и профили качества видео.',
      en: 'Configure image settings and video quality profiles.',
    },
    saving: {
      ru: 'Настройте скачивание, рабочие материалы, библиотеку и черновики.',
      en: 'Configure downloads, working materials, the library, and drafts.',
    },
    storageDrafts: {
      ru: 'Управляйте локальным хранилищем, сроками хранения и черновиками.',
      en: 'Manage local storage, retention periods, and drafts.',
    },
    annotations: {
      ru: 'Настройте рамки, выноски, нумерацию и теги для аннотаций.',
      en: 'Configure frames, callouts, numbering, and annotation tags.',
    },
    editorResources: {
      ru: 'Управляйте наборами инструментов и цветовыми палитрами редактора.',
      en: 'Manage editor tool presets and color palettes.',
    },
    aiConnections: {
      ru: 'Подключите AI-провайдеров и выберите доступные модели.',
      en: 'Connect AI providers and choose the available models.',
    },
    aiPrompts: {
      ru: 'Настройте системные промпты и шаблоны для повторного использования.',
      en: 'Configure system prompts and reusable templates.',
    },
    voiceInput: {
      ru: 'Проверьте и настройте голосовой ввод для аннотаций и редакторов.',
      en: 'Test and configure voice input for annotations and editors.',
    },
    nativeApp: {
      ru: 'Настройте подключение, захват и команды приложения Sniptale.',
      en: 'Configure connection, capture, and commands for the Sniptale app.',
    },
    accessData: {
      ru: 'Управляйте разрешениями, конфиденциальностью и локальными данными.',
      en: 'Manage permissions, privacy, and local data.',
    },
  },
  views: {
    settings: { ru: 'Настройки', en: 'Settings' },
    storage: { ru: 'Хранилище', en: 'Storage' },
    folderTemplates: { ru: 'Шаблоны папок', en: 'Folder templates' },
    templates: { ru: 'Шаблоны', en: 'Templates' },
    prompts: { ru: 'Промпты', en: 'Prompts' },
    image: { ru: 'Изображения', en: 'Images' },
    video: { ru: 'Видео', en: 'Video' },
    borders: { ru: 'Рамки', en: 'Frames' },
    callouts: { ru: 'Выноски', en: 'Callouts' },
    numbering: { ru: 'Нумерация', en: 'Numbering' },
    tags: { ru: 'Теги', en: 'Tags' },
    tools: { ru: 'Инструменты', en: 'Tools' },
    palettes: { ru: 'Палитры', en: 'Palettes' },
    surfaces: { ru: 'Поверхности', en: 'Surfaces' },
    gradients: { ru: 'Градиенты', en: 'Gradients' },
    connection: { ru: 'Подключение', en: 'Connection' },
    capture: { ru: 'Захват', en: 'Capture' },
    commands: { ru: 'Команды', en: 'Commands' },
    telemetry: { ru: 'Телеметрия', en: 'Telemetry' },
    permissions: { ru: 'Разрешения', en: 'Permissions' },
    privacy: { ru: 'Конфиденциальность', en: 'Privacy' },
  },
  documentTitle: {
    ru: 'Sniptale — Настройки',
    en: 'Sniptale — Settings',
  },
  appearance: {
    ru: 'Интерфейс',
    en: 'Interface',
  },
  ai: {
    ru: 'Настройки AI',
    en: 'AI settings',
  },
  presets: {
    ru: 'Шаблоны размеров',
    en: 'Size presets',
  },
  saves: {
    ru: 'Сохранение файлов',
    en: 'File saving',
  },
  highlighter: {
    ru: 'Режим выделения',
    en: 'Highlight mode',
  },
  editor: {
    ru: 'Редактор изображений',
    en: 'Image editor',
  },
  image: {
    ru: 'Изображения',
    en: 'Images',
  },
  video: {
    ru: 'Качество видео',
    en: 'Video quality',
  },
  voiceInput: {
    ru: 'Голосовой ввод',
    en: 'Voice input',
  },
  quickactions: {
    ru: 'Быстрые действия',
    en: 'Quick actions',
  },
  nativeApp: {
    ru: 'Приложение Sniptale',
    en: 'Sniptale app',
  },
  templates: {
    ru: 'Шаблоны промптов',
    en: 'Prompt templates',
  },
  permissions: {
    ru: 'Разрешения',
    en: 'Permissions',
  },
  privacy: {
    ru: 'Конфиденциальность',
    en: 'Privacy',
  },
  sidebarEyebrow: {
    ru: 'Настройки',
    en: 'Settings',
  },
  footerBrand: {
    ru: 'Sniptale',
    en: 'Sniptale',
  },
});
