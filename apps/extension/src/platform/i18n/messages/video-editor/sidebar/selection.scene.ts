import { defineMessageSource } from '../../source';

export const videoEditorSidebarSelectionSceneMessages = defineMessageSource({
  recognitionClose: { ru: 'Закрыть результат', en: 'Close result' },
  recognitionFailed: {
    ru: 'Действие не выполнено. Повторите его. Готовый результат остаётся доступен до закрытия.',
    en: 'The action failed. Try again. A completed result remains available until you close it.',
  },
  recognitionSaveRetry: {
    ru: 'Изменения текста применены локально. Повторите применение, чтобы подтвердить сохранение. Закрытие результата не отменяет изменения. Их можно отменить через Undo.',
    en: 'Text changes are applied locally. Apply again to confirm saving. Closing this result keeps the changes. Undo can reverse these changes.',
  },
  recognitionNativeScope: {
    ru: 'Аудио выбранного клипа. Время указано в исходнике, до изменения скорости и размещения на таймлайне.',
    en: 'Audio from the selected clip. Times refer to the source, before playback speed and timeline placement.',
  },
  recognitionInvalidRange: {
    ru: 'Выберите интервал внутри сохранённого фрагмента с аудио.',
    en: 'Choose an interval within the retained clip that contains audio.',
  },
  recognitionSaved: {
    ru: 'Текст сохранён. Он доступен в разделе текста сцены.',
    en: 'Text saved. It is available in the scene text section.',
  },
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
