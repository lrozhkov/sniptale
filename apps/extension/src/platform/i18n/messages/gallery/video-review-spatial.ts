import { defineMessageSource } from '../source';

export const galleryVideoReviewSpatialMessages = defineMessageSource({
  perspective: { ru: 'Поворот и перспектива', en: 'Rotation and perspective' },
  depthOfField: { ru: 'Глубина резкости', en: 'Depth of field' },
  spatialOn: { ru: 'включено', en: 'on' },
  spatialEnabled: { ru: 'Применять', en: 'Apply' },
  spatialReset: { ru: 'Сбросить раздел', en: 'Reset section' },
  perspectiveX: { ru: 'Наклон X', en: 'Tilt X' },
  perspectiveY: { ru: 'Наклон Y', en: 'Tilt Y' },
  perspectiveZ: { ru: 'Поворот Z', en: 'Rotation Z' },
  perspectiveStrength: { ru: 'Перспектива', en: 'Perspective' },
  perspectiveBackground: {
    ru: 'На связанной цепочке с перспективой фон неподвижен.',
    en: 'The background stays fixed throughout a linked sequence with perspective.',
  },
  depthMode: { ru: 'Режим', en: 'Mode' },
  depthModeDepth: { ru: 'По глубине', en: 'By depth' },
  depthModeArea: { ru: 'Область фокуса', en: 'Focus area' },
  depthX: { ru: 'Фокус X', en: 'Focus X' },
  depthY: { ru: 'Фокус Y', en: 'Focus Y' },
  depthWidth: { ru: 'Резкая зона', en: 'Sharp zone' },
  depthSoftness: { ru: 'Мягкость', en: 'Softness' },
  depthStrength: { ru: 'Размытие', en: 'Blur' },
  spatialUnavailable: {
    ru: 'Не удалось показать перспективу. Повторите попытку или выключите эффект в настройках зума.',
    en: 'Perspective could not be displayed. Retry or disable the effect in zoom settings.',
  },
});
