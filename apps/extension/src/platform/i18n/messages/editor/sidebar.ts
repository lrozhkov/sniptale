import { defineMessageSource } from '../source';

export const editorSidebarMessages = defineMessageSource({
  defaultBadge: {
    ru: 'По умолчанию',
    en: 'Default',
  },
  rasterSelectionMode: {
    ru: 'Режим выделения',
    en: 'Selection mode',
  },
  rasterSelectionMarquee: {
    ru: 'Прямоугольник',
    en: 'Marquee',
  },
  rasterSelectionWand: {
    ru: 'Волшебная палочка',
    en: 'Magic wand',
  },
  rasterSelectionLasso: {
    ru: 'Свободное лассо',
    en: 'Free lasso',
  },
  rasterSelectionTarget: {
    ru: 'Активная маска',
    en: 'Active mask',
  },
  rasterSelectionActive: {
    ru: 'Маска активна',
    en: 'Mask active',
  },
  rasterSelectionClear: {
    ru: 'Очистить выделение',
    en: 'Clear selection',
  },
  rasterBrushColor: {
    ru: 'Цвет кисти',
    en: 'Brush color',
  },
  rasterBrushHardness: {
    ru: 'Жесткость',
    en: 'Hardness',
  },
  rasterBrushOpacity: {
    ru: 'Прозрачность',
    en: 'Opacity',
  },
  rasterBrushSize: {
    ru: 'Размер кисти',
    en: 'Brush size',
  },
  rasterEraserSize: {
    ru: 'Размер ластика',
    en: 'Eraser size',
  },
  rasterFillMode: {
    ru: 'Режим заливки',
    en: 'Fill mode',
  },
  rasterFillBucket: {
    ru: 'Заливка',
    en: 'Bucket fill',
  },
  rasterFillLinearGradient: {
    ru: 'Линейный градиент',
    en: 'Linear gradient',
  },
  rasterFillColor: {
    ru: 'Цвет заливки',
    en: 'Fill color',
  },
  rasterGradientFrom: {
    ru: 'Градиент от',
    en: 'Gradient from',
  },
  rasterGradientTo: {
    ru: 'Градиент до',
    en: 'Gradient to',
  },
  noSavePresets: {
    ru: 'Нет активных пресетов. Добавьте путь в настройках, чтобы быстро сохранять в папку без системного диалога.',
    en: 'No active presets. Add a path in settings to save quickly without the system dialog.',
  },
});
