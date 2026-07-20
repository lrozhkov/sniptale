import { defineMessageSource } from '../../source';

export const videoEditorSidebarSelectionSceneMessages = defineMessageSource({
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
    ru: 'Кинематографичный дрейф',
    en: 'Cinematic drift',
  },
  sceneBackgroundAnimationBreathe: {
    ru: 'Смещение света',
    en: 'Light sweep',
  },
  sceneBackgroundAnimationAudioReactive: {
    ru: 'Аудио',
    en: 'Audio',
  },
  sceneBackgroundImageAssetLabel: {
    ru: 'Фоновое изображение',
    en: 'Background image',
  },
  sceneBackgroundImageEmpty: {
    ru: 'Сначала импортируйте изображение в проект.',
    en: 'Import an image into the project first.',
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
