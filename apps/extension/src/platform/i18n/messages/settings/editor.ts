import { defineMessageSource } from '../source';

export const settingsEditorMessages = defineMessageSource({
  backgrounds: {
    title: { en: 'Backgrounds', ru: 'Фон' },
    add: { en: 'Add background', ru: 'Добавить фон' },
    upload: { en: 'From computer', ru: 'С компьютера' },
    library: { en: 'From Library', ru: 'Из библиотеки' },
    showMore: { en: 'Show more', ru: 'Показать ещё' },
    unavailable: { en: 'Image unavailable', ru: 'Изображение недоступно' },
    failed: {
      en: 'Could not load or save the background. Try again.',
      ru: 'Не удалось загрузить или сохранить фон. Попробуйте ещё раз.',
    },
    formats: {
      en: 'PNG, JPEG, WebP, SVG, AVIF, GIF, BMP, ICO · up to 16 MB',
      ru: 'PNG, JPEG, WebP, SVG, AVIF, GIF, BMP, ICO · до 16 МБ',
    },
    libraryNote: {
      en: 'Custom backgrounds are saved in Library. Removing a preset keeps the image in Library.',
      ru: 'Ваши фоны сохраняются в библиотеке. Удаление из списка фонов не удаляет само изображение.',
    },
    name: { en: 'Background name', ru: 'Название фона' },
    rename: { en: 'Rename background', ru: 'Переименовать фон' },
    empty: { en: 'No images in Library', ru: 'В библиотеке пока нет изображений' },
    search: { en: 'Find an image', ru: 'Найти изображение' },
    filter: { en: 'Saved filter', ru: 'Сохранённый фильтр' },
    allImages: { en: 'All images', ru: 'Все изображения' },
    noResults: { en: 'No matching images', ru: 'Подходящих изображений нет' },
    select: { en: 'Use background', ru: 'Выбрать фон' },
    loading: { en: 'Loading images…', ru: 'Загрузка изображений…' },
    retry: { en: 'Retry', ru: 'Повторить' },
  },
  subtitle: {
    ru: 'Шаблоны инструментов и палитры редактора изображений и рисования на странице.',
    en: 'Tool presets and palettes for the image editor and page drawing.',
  },
  toolPresetsTitle: {
    ru: 'Настройки инструментов',
    en: 'Tool settings',
  },
  toolPresetsDescription: {
    ru: 'Выберите инструмент и управляйте сохранёнными шаблонами редактора.',
    en: 'Pick a tool and manage the saved editor presets.',
  },
  paletteTitle: {
    ru: 'Настройки палитры',
    en: 'Palette settings',
  },
  paletteDescription: {
    ru: 'Цвета из этой палитры используются в инструментах и фоне сцены.',
    en: 'These palette colors are used by tools and the scene background.',
  },
  drawingQuickColorsDescription: {
    ru: 'Первые пять цветов — постоянный быстрый набор для рисования. Меняйте их цвета и порядок здесь. Все десять цветов доступны в палитре выбора цвета.',
    en: 'The first five colors are your fixed drawing shortcuts. Change their colors and order here. All ten colors are available in the color picker palette.',
  },
  createInEditorHint: {
    ru: 'Новые шаблоны создаются прямо в инспекторе редактора через кнопку сохранения.',
    en: 'Create new presets directly from the editor inspector with the save button.',
  },
  paletteShapeStroke: {
    ru: 'Контур фигур',
    en: 'Shape stroke',
  },
  paletteShapeFill: {
    ru: 'Заливка фигур',
    en: 'Shape fill',
  },
  paletteTextColor: {
    ru: 'Цвет текста',
    en: 'Text color',
  },
  paletteTextBackground: {
    ru: 'Фон текста',
    en: 'Text background',
  },
  paletteSceneBackground: {
    ru: 'Фон сцены',
    en: 'Scene background',
  },
  paletteDrawing: {
    ru: 'Рисование',
    en: 'Drawing',
  },
  paletteSaveError: {
    ru: 'Не удалось сохранить палитру рисования',
    en: 'Could not save the drawing palette',
  },
  presetName: {
    ru: 'Название шаблона',
    en: 'Preset name',
  },
  customizedBadge: {
    ru: 'Изменён',
    en: 'Modified',
  },
  defaultCannotDisable: {
    ru: 'Шаблон по умолчанию нельзя отключить',
    en: 'The default preset cannot be disabled',
  },
  defaultCannotDelete: {
    ru: 'Сначала выберите другой шаблон по умолчанию',
    en: 'Choose another default preset first',
  },
  disabledCannotBeDefault: {
    ru: 'Сначала включите шаблон',
    en: 'Enable the preset first',
  },
  surfaceStyles: {
    title: {
      ru: 'Стили поверхностей',
      en: 'Surface styles',
    },
    description: {
      ru: 'Многоразовые стили поверхностей: заливка, прозрачность, размытие и тени.',
      en: 'Reusable surface styles: fill, transparency, blur, and shadows.',
    },
    add: {
      ru: 'Добавить стиль',
      en: 'Add style',
    },
    addTitle: {
      ru: 'Новый стиль поверхности',
      en: 'New surface style',
    },
    editTitle: {
      ru: 'Изменить стиль поверхности',
      en: 'Edit surface style',
    },
    cssEnabled: {
      ru: 'Заливка и эффекты поверхности',
      en: 'Fill and surface effects',
    },
    paintOnly: {
      ru: 'Только заливка',
      en: 'Fill only',
    },
  },
  gradients: {
    title: {
      ru: 'Шаблоны градиентов',
      en: 'Gradient presets',
    },
    description: {
      ru: 'Многоразовые шаблоны градиентов.',
      en: 'Reusable gradient presets.',
    },
    add: {
      ru: 'Добавить градиент',
      en: 'Add gradient',
    },
    addTitle: {
      ru: 'Новый шаблон градиента',
      en: 'New gradient preset',
    },
    editTitle: {
      ru: 'Изменить шаблон градиента',
      en: 'Edit gradient preset',
    },
    paint: {
      ru: 'Градиент',
      en: 'Gradient',
    },
    gradientRequired: {
      ru: 'Для шаблона нужно выбрать градиент.',
      en: 'Choose a gradient for this preset.',
    },
    types: {
      linear: { ru: 'Линейный', en: 'Linear' },
      radial: { ru: 'Радиальный', en: 'Radial' },
      conic: { ru: 'Конический', en: 'Conic' },
    },
  },
});
