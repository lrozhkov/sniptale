import { defineMessageSource } from '../source';

export const videoEditorEffectsLibraryMessages = defineMessageSource({
  applyButton: { ru: 'Добавить', en: 'Add' },
  applyFailedWithDetail: {
    ru: 'Не удалось добавить эффект: {detail}',
    en: 'The effect could not be added: {detail}',
  },
  button: { ru: 'Эффекты', en: 'Effects' },
  catalogLoadErrorWithDetail: {
    ru: 'Не удалось загрузить каталог эффектов: {detail}',
    en: 'The effects catalog could not be loaded: {detail}',
  },
  deleteFailedWithDetail: {
    ru: 'Не удалось удалить набор эффектов: {detail}',
    en: 'The effects bundle could not be deleted: {detail}',
  },
  deletePack: { ru: 'Удалить bundle', en: 'Delete bundle' },
  description: {
    ru: 'Декларативные EffectV1 и встроенные аннотации.',
    en: 'Declarative EffectV1 effects and built-in annotations.',
  },
  disablePack: { ru: 'Выключить bundle', en: 'Disable bundle' },
  enablePack: { ru: 'Включить bundle', en: 'Enable bundle' },
  effectV1Label: { ru: 'Эффекты', en: 'Effects' },
  importPack: { ru: 'Импортировать EffectV1', en: 'Import EffectV1' },
  importFailedWithDetail: {
    ru: 'EffectV1 не импортирован: {detail}',
    en: 'EffectV1 was not imported: {detail}',
  },
  incompatibleButton: { ru: 'Выберите цель', en: 'Select target' },
  invalidPack: { ru: 'Повреждённый EffectV1 bundle', en: 'Invalid EffectV1 bundle' },
  invalidPackDescription: {
    ru: 'Bundle нельзя применить или включить. Его можно только удалить.',
    en: 'This bundle cannot be applied or enabled. It can only be deleted.',
  },
  controlEnabled: { ru: 'Эффект включён', en: 'Effect enabled' },
  controlStartTime: { ru: 'Начало', en: 'Start' },
  deleteInstance: { ru: 'Удалить', en: 'Delete' },
  duplicateInstance: { ru: 'Дублировать', en: 'Duplicate' },
  invalidSnapshot: { ru: 'Snapshot EffectV1 повреждён.', en: 'EffectV1 snapshot is invalid.' },
  moveDown: { ru: 'Ниже', en: 'Move down' },
  moveUp: { ru: 'Выше', en: 'Move up' },
  nativeAnnotationsTitle: { ru: 'Встроенные аннотации', en: 'Built-in annotations' },
  noImportedPacks: {
    ru: 'Импортированных EffectV1 bundle нет.',
    en: 'No imported EffectV1 bundles.',
  },
  title: { ru: 'Эффекты', en: 'Effects' },
  updateFailedWithDetail: {
    ru: 'Не удалось изменить набор эффектов: {detail}',
    en: 'The effects bundle could not be updated: {detail}',
  },
});
