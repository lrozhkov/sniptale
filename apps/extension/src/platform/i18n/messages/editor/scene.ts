import { defineMessageSource } from '../source';

function sentence(...parts: string[]) {
  return parts.join(' ');
}

export const editorSceneMessages = defineMessageSource({
  placementSection: {
    ru: 'Размещение',
    en: 'Placement',
  },
  backgroundTypeSection: {
    ru: 'Тип фона',
    en: 'Background type',
  },
  scenePreviewSection: {
    ru: 'Превью сцены',
    en: 'Scene preview',
  },
  scenePaddingSection: {
    ru: 'Отступ сцены',
    en: 'Scene padding',
  },
  applyButton: {
    ru: 'Применить',
    en: 'Apply',
  },
  gradientStartTitle: {
    ru: 'Старт градиента',
    en: 'Gradient start',
  },
  gradientStartLabel: {
    ru: 'Старт',
    en: 'Start',
  },
  gradientEndTitle: {
    ru: 'Финиш градиента',
    en: 'Gradient end',
  },
  gradientEndLabel: {
    ru: 'Финиш',
    en: 'End',
  },
  gradientStopLabel: {
    ru: 'Цвет',
    en: 'Color',
  },
  gradientStopTitle: {
    ru: 'Цвет градиента',
    en: 'Gradient color',
  },
  gradientAddStop: {
    ru: 'Добавить цвет',
    en: 'Add color',
  },
  gradientMoveStopUp: {
    ru: 'Переместить цвет выше',
    en: 'Move color up',
  },
  gradientMoveStopDown: {
    ru: 'Переместить цвет ниже',
    en: 'Move color down',
  },
  gradientRemoveStop: {
    ru: 'Удалить цвет',
    en: 'Remove color',
  },
  gradientAngleAria: {
    ru: 'Угол градиента',
    en: 'Gradient angle',
  },
  gradientAngleLabel: {
    ru: 'Угол',
    en: 'Angle',
  },
  uploadImage: {
    ru: 'Загрузить картинку',
    en: 'Upload image',
  },
  replaceImage: {
    ru: 'Заменить картинку',
    en: 'Replace image',
  },
  clearImage: {
    ru: 'Очистить',
    en: 'Clear',
  },
  backgroundImagePreviewAlt: {
    ru: 'Превью фоновой картинки',
    en: 'Background image preview',
  },
  backgroundImageModeAria: {
    ru: 'Режим background image',
    en: 'Background image mode',
  },
  backgroundImageEmptyState: {
    ru: 'Картинка не выбрана',
    en: 'No image selected',
  },
  sceneBackgroundTitle: {
    ru: 'Фон сцены',
    en: 'Scene background',
  },
  sceneBackgroundLabel: {
    ru: 'Фон',
    en: 'Background',
  },
  expandCanvasDescription: {
    ru: sentence(
      'Документ увеличивается вокруг текущего изображения.',
      'Этот режим ближе всего к Xnapper/Shottr-подаче: скрин остаётся в исходном масштабе,',
      'а фон появляется за счёт дополнительного холста.'
    ),
    en: sentence(
      'The document expands around the current image.',
      'This is closest to the Xnapper/Shottr approach: the screenshot keeps its original scale',
      'and the background comes from extra canvas space.'
    ),
  },
  fitImageDescription: {
    ru: sentence(
      'Текущий холст сохраняется, а основное изображение и аннотации масштабируются внутрь сцены.',
      'Подходит для карточек, обложек и крупных background-подложек.'
    ),
    en: sentence(
      'The current canvas stays the same while the main image and annotations scale into the scene.',
      'This works well for cards, covers, and larger background backings.'
    ),
  },
  scenePaddingAria: {
    ru: 'Отступ сцены',
    en: 'Scene padding',
  },
  scenePaddingUniformLabel: {
    ru: 'Все стороны',
    en: 'All sides',
  },
  scenePaddingLinkAria: {
    ru: 'Связать отступы сцены',
    en: 'Link scene padding',
  },
  scenePaddingTopLabel: {
    ru: 'Верх',
    en: 'Top',
  },
  scenePaddingRightLabel: {
    ru: 'Право',
    en: 'Right',
  },
  scenePaddingBottomLabel: {
    ru: 'Низ',
    en: 'Bottom',
  },
  scenePaddingLeftLabel: {
    ru: 'Лево',
    en: 'Left',
  },
  scenePaddingTopAria: {
    ru: 'Отступ сцены сверху',
    en: 'Scene top padding',
  },
  scenePaddingRightAria: {
    ru: 'Отступ сцены справа',
    en: 'Scene right padding',
  },
  scenePaddingBottomAria: {
    ru: 'Отступ сцены снизу',
    en: 'Scene bottom padding',
  },
  scenePaddingLeftAria: {
    ru: 'Отступ сцены слева',
    en: 'Scene left padding',
  },
});
