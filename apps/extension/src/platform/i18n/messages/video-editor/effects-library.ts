import { defineMessageSource } from '../source';

export const videoEditorEffectsLibraryMessages = defineMessageSource({
  applyFailed: {
    ru: 'Не удалось добавить эффект.',
    en: 'The effect could not be added.',
  },
  applyButton: { ru: 'Добавить', en: 'Add' },
  applyToClip: { ru: 'Добавить к клипу', en: 'Add to clip' },
  applyToScene: { ru: 'Добавить на сцену', en: 'Add to scene' },
  applyToTransition: { ru: 'Добавить к переходу', en: 'Add to transition' },
  applyFailedWithDetail: {
    ru: 'Не удалось добавить эффект: {detail}',
    en: 'The effect could not be added: {detail}',
  },
  button: { ru: 'Эффекты', en: 'Effects' },
  catalogLoadErrorWithDetail: {
    ru: 'Не удалось загрузить каталог эффектов: {detail}',
    en: 'The effects catalog could not be loaded: {detail}',
  },
  deleteFailed: {
    ru: 'Не удалось удалить набор эффектов.',
    en: 'The effects bundle could not be deleted.',
  },
  deleteFailedWithDetail: {
    ru: 'Не удалось удалить набор эффектов: {detail}',
    en: 'The effects bundle could not be deleted: {detail}',
  },
  deletePack: { ru: 'Удалить набор', en: 'Delete set' },
  description: {
    ru: 'Импортируйте набор эффектов и выберите эффект для сцены, клипа или перехода.',
    en: 'Import an effects bundle and choose an effect for the scene, a clip, or a transition.',
  },
  disablePack: { ru: 'Выключить набор', en: 'Disable set' },
  enablePack: { ru: 'Включить набор', en: 'Enable set' },
  effectV1Label: { ru: 'Эффекты', en: 'Effects' },
  importPack: { ru: 'Импорт эффектов', en: 'Import effects' },
  importFailedWithDetail: {
    ru: 'Не удалось импортировать эффекты: {detail}',
    en: 'The effects could not be imported: {detail}',
  },
  importFailed: {
    ru: 'Не удалось импортировать эффекты.',
    en: 'The effects could not be imported.',
  },
  incompatibleButton: { ru: 'Выберите цель', en: 'Select target' },
  selectClipTarget: { ru: 'Сначала выберите клип', en: 'Select a clip first' },
  selectTransitionTarget: {
    ru: 'Сначала выберите переход',
    en: 'Select a transition first',
  },
  documentKindScene: { ru: 'Эффект сцены', en: 'Scene effect' },
  documentKindClip: { ru: 'Эффект клипа', en: 'Clip effect' },
  documentKindTransition: { ru: 'Эффект перехода', en: 'Transition effect' },
  invalidPack: { ru: 'Недоступный набор эффектов', en: 'Unavailable effect set' },
  invalidPackDescription: {
    ru: 'Этот набор нельзя включить или применить. Удалите его и импортируйте исправленный файл.',
    en: 'This set cannot be enabled or applied. Remove it and import a corrected file.',
  },
  controlEnabled: { ru: 'Эффект включён', en: 'Effect enabled' },
  controlStartTime: { ru: 'Начало', en: 'Start' },
  deleteInstance: { ru: 'Удалить', en: 'Delete' },
  duplicateInstance: { ru: 'Дублировать', en: 'Duplicate' },
  invalidSnapshot: {
    ru: 'Не удалось прочитать сохранённый эффект.',
    en: 'The saved effect could not be read.',
  },
  moveDown: { ru: 'Ниже', en: 'Move down' },
  moveUp: { ru: 'Выше', en: 'Move up' },
  nativeAnnotationsTitle: { ru: 'Встроенные аннотации', en: 'Built-in annotations' },
  noImportedPacks: {
    ru: 'Импортируйте эффекты из файла, чтобы добавить их на сцену, к клипу или переходу.',
    en: 'Import effects from a file to add them to the scene, a clip, or a transition.',
  },
  title: { ru: 'Эффекты', en: 'Effects' },
  searchPlaceholder: { ru: 'Найти эффект', en: 'Find an effect' },
  noSearchResults: {
    ru: 'Эффекты не найдены. Попробуйте другое название.',
    en: 'No effects found. Try another name.',
  },
  disabledPack: { ru: 'Набор выключен', en: 'Set disabled' },
  unavailableEffect: { ru: 'Недоступный эффект', en: 'Unavailable effect' },
  updateFailedWithDetail: {
    ru: 'Не удалось изменить набор эффектов: {detail}',
    en: 'The effects bundle could not be updated: {detail}',
  },
  updateFailed: {
    ru: 'Не удалось изменить набор эффектов.',
    en: 'The effects bundle could not be updated.',
  },
});
