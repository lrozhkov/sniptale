import { defineMessageSource } from '../source';
import {
  blurStrengthMessage,
  blurTypeDistortionMessage,
  blurTypeGaussianMessage,
  blurTypeLabelMessage,
  blurTypePixelateMessage,
  blurTypeSolidMessage,
} from '../shared/blur-controls';

export const contentOverlayControlsMessages = defineMessageSource({
  frameStyleLabel: {
    ru: 'Стиль рамки',
    en: 'Frame style',
  },
  blurStrengthLabelPrefix: blurStrengthMessage,
  blurTypeLabel: blurTypeLabelMessage,
  blurTypeGaussian: blurTypeGaussianMessage,
  blurTypeDistortion: blurTypeDistortionMessage,
  blurTypePixelate: blurTypePixelateMessage,
  blurTypeSolid: blurTypeSolidMessage,
  showBorderTitle: {
    ru: 'Показывать границу',
    en: 'Show border',
  },
  showBorderHint: {
    ru: 'Оставляет контур рамки поверх blur-эффекта',
    en: 'Keeps the frame outline over the blur effect',
  },
  focusBorderHint: {
    ru: 'Сохраняет контур рамки поверх затемнения',
    en: 'Keeps the frame outline over the dimming overlay',
  },
  focusDimmingLabelPrefix: {
    ru: 'Затемнение:',
    en: 'Dimming:',
  },
  selectionSizeTitle: {
    ru: 'Размер выделения',
    en: 'Selection size',
  },
  widthField: {
    ru: 'Ширина',
    en: 'Width',
  },
  heightField: {
    ru: 'Высота',
    en: 'Height',
  },
  decreaseWidth: {
    ru: 'Уменьшить ширину',
    en: 'Decrease width',
  },
  increaseWidth: {
    ru: 'Увеличить ширину',
    en: 'Increase width',
  },
  decreaseHeight: {
    ru: 'Уменьшить высоту',
    en: 'Decrease height',
  },
  increaseHeight: {
    ru: 'Увеличить высоту',
    en: 'Increase height',
  },
  keepAspectRatioTitle: {
    ru: 'Сохранить пропорции',
    en: 'Keep aspect ratio',
  },
  keepAspectRatioHint: {
    ru: 'Ширина и высота меняются вместе',
    en: 'Width and height change together',
  },
  regionRecordingLabel: {
    ru: 'Запись области',
    en: 'Region recording',
  },
  cancel: {
    ru: 'Отмена',
    en: 'Cancel',
  },
  save: {
    ru: 'Сохранить',
    en: 'Save',
  },
  regionConfirm: {
    ru: 'Выбрать область',
    en: 'Select region',
  },
  regionInstruction: {
    ru: 'Перетащите область для записи или измените её размер',
    en: 'Drag a region to record or resize it',
  },
});
