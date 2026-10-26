import { defineMessageSource } from '../source';

/** Compact animation phase and direction controls for Focus effects. */
export const galleryVideoReviewAnimationMessages = defineMessageSource({
  borderOrigin: { ru: 'Начало', en: 'Origin' },
  'borderOrigin_top-center': { ru: 'Сверху по центру', en: 'Top center' },
  'borderOrigin_top-left': { ru: 'Слева сверху', en: 'Top left' },
  'borderOrigin_top-right': { ru: 'Справа сверху', en: 'Top right' },
  'borderOrigin_bottom-right': { ru: 'Справа снизу', en: 'Bottom right' },
  'borderOrigin_bottom-left': { ru: 'Слева снизу', en: 'Bottom left' },
  borderBothSides: { ru: 'С двух сторон', en: 'Two sides' },
  borderDrawing: { ru: 'Прорисовка', en: 'Draw' },
  borderErasing: { ru: 'Стирание', en: 'Erase' },
  borderRotation: { ru: 'Вращение', en: 'Rotate' },
  borderDirection: { ru: 'Направление', en: 'Direction' },
  borderClockwise: { ru: 'По часовой стрелке', en: 'Clockwise' },
  borderCounterclockwise: { ru: 'Против часовой стрелки', en: 'Counterclockwise' },
});
