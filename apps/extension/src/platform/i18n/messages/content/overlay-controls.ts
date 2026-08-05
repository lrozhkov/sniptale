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
  frameStyleModePreset: { ru: 'Пресеты', en: 'Presets' },
  frameStyleModeManual: { ru: 'Вручную', en: 'Manual' },
  frameStyleManualNavigation: {
    ru: 'Ручная настройка рамки',
    en: 'Manual frame style settings',
  },
  frameStyleSaveNew: { ru: 'Новый пресет', en: 'New preset' },
  frameStylePresetName: { ru: 'Название пресета', en: 'Preset name' },
  frameStyleCreate: { ru: 'Создать', en: 'Create' },
  frameStyleOverwrite: { ru: 'Перезаписать пресет', en: 'Overwrite preset' },
  frameStyleSelectPreset: { ru: 'Выберите пресет', en: 'Select a preset' },
  frameStyleOverwriteAction: { ru: 'Перезаписать', en: 'Overwrite' },
  frameStyleCreated: { ru: 'Пресет создан', en: 'Preset created' },
  frameStyleOverwritten: { ru: 'Пресет обновлён', en: 'Preset updated' },
  frameStyleLabel: {
    ru: 'Рамка и заливка',
    en: 'Frame and fill',
  },
  configureFrameStyle: {
    ru: 'Настроить стиль',
    en: 'Customize style',
  },
  hideFrameStyle: {
    ru: 'Скрыть из списка',
    en: 'Hide from list',
  },
  restoreFrameStyle: {
    ru: 'Вернуть в список',
    en: 'Restore to list',
  },
  addFrameStyle: {
    ru: 'Добавить',
    en: 'Add',
  },
  saveFrameStyleError: {
    ru: 'Не удалось сохранить стиль рамки',
    en: 'Could not save the frame style',
  },
  toggleFrameStyleError: {
    ru: 'Не удалось изменить видимость стиля',
    en: 'Could not change style visibility',
  },
  blurStrengthLabelPrefix: blurStrengthMessage,
  blurTypeLabel: blurTypeLabelMessage,
  blurTypeGaussian: blurTypeGaussianMessage,
  blurTypeDistortion: blurTypeDistortionMessage,
  blurTypePixelate: blurTypePixelateMessage,
  blurTypeSolid: blurTypeSolidMessage,
  showBorderTitle: {
    ru: 'Показывать рамку и заливку',
    en: 'Show frame and fill',
  },
  showBorderHint: {
    ru: 'Накладывает выбранную рамку и её заливку поверх эффекта, не меняя размер области',
    en: 'Overlays the selected frame and its fill without changing the area size',
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
