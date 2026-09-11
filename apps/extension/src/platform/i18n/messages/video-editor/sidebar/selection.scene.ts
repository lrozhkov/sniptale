import { defineMessageSource } from '../../source';

export const videoEditorSidebarSelectionSceneMessages = defineMessageSource({
  canvasFormatLabel: { ru: 'Пропорции', en: 'Aspect ratio' },
  canvasResolutionLabel: { ru: 'Разрешение', en: 'Resolution' },
  canvasFormatWide: { ru: 'Горизонтальный', en: 'Landscape' },
  canvasFormatVertical: { ru: 'Вертикальный', en: 'Vertical' },
  canvasFormatSquare: { ru: 'Квадратный', en: 'Square' },
  canvasFormatPortrait: { ru: 'Портретный', en: 'Portrait' },
  canvasFormatClassic: { ru: 'Классический', en: 'Classic' },
  canvasCustom: { ru: 'Произвольные', en: 'Custom' },
  canvasExactSize: { ru: 'Точные размеры', en: 'Custom dimensions' },
  sceneBackgroundTypeLabel: {
    ru: 'Тип фона',
    en: 'Background type',
  },
  sceneBackgroundSolid: {
    ru: 'Сплошной',
    en: 'Solid',
  },
  sceneBackgroundGradient: {
    ru: 'Градиент',
    en: 'Gradient',
  },
  sceneBackgroundImage: {
    ru: 'Изображение',
    en: 'Image',
  },
  sceneBackgroundColorLabel: {
    ru: 'Цвет фона',
    en: 'Background color',
  },
  sceneBackgroundFromLabel: {
    ru: 'Начальный цвет',
    en: 'Start color',
  },
  sceneBackgroundToLabel: {
    ru: 'Конечный цвет',
    en: 'End color',
  },
  sceneBackgroundAngleLabel: {
    ru: 'Угол, °',
    en: 'Angle, °',
  },
  sceneBackgroundPresetLabel: {
    ru: 'Варианты градиента',
    en: 'Gradient presets',
  },
  sceneBackgroundAnimationModeLabel: {
    ru: 'Анимация',
    en: 'Animation',
  },
  sceneBackgroundAnimationSpeedLabel: {
    ru: 'Скорость',
    en: 'Speed',
  },
  sceneBackgroundAnimationIntensityLabel: {
    ru: 'Интенсивность',
    en: 'Intensity',
  },
  sceneBackgroundAnimationNone: {
    ru: 'Нет',
    en: 'None',
  },
  sceneBackgroundAnimationRotate: {
    ru: 'Вращение',
    en: 'Rotation',
  },
  sceneBackgroundAnimationBreathe: {
    ru: 'Дыхание',
    en: 'Breathing',
  },
  sceneBackgroundAnimationAudioReactive: {
    ru: 'Аудио',
    en: 'Audio',
  },
  sceneBackgroundImageAssetLabel: {
    ru: 'Фоновое изображение',
    en: 'Background image',
  },
  sceneBackgroundImageUpload: { ru: 'Загрузить изображение', en: 'Upload image' },
  sceneBackgroundAnimationDrift: { ru: 'Перетекание', en: 'Flow' },
  sceneBackgroundImageEmpty: {
    ru: 'Изображение заполнит фон; оригинал останется в материалах.',
    en: 'The image fills the background and stays in materials.',
  },
  gridSettingsTitle: {
    ru: 'Сетка',
    en: 'Grid',
  },
  gridSettingsSubtitle: {
    ru: 'Привязка и шаг',
    en: 'Snap and spacing',
  },
  gridSettingsDescription: {
    ru: 'Сетка помогает выравнивать объекты в превью и не меняет экспорт.',
    en: 'The grid helps align objects in preview and does not change export output.',
  },
});
