import { defineMessageSource } from '../source';

export const settingsEditorMessages = defineMessageSource({
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
      ru: 'Оформление поверхностей выносок: заливка, прозрачность, размытие и тени.',
      en: 'Callout surface styling: fill, transparency, blur, and shadows.',
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
      ru: 'Готовые градиенты для заливок рамок и аннотаций.',
      en: 'Reusable gradients for frame and annotation fills.',
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
