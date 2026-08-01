import { defineMessageSource } from '../source';

export const settingsVideoQualityMessages = defineMessageSource({
  kicker: {
    ru: 'Запись экрана',
    en: 'Screen recording',
  },
  title: {
    ru: 'Профили качества видео',
    en: 'Video quality profiles',
  },
  description: {
    ru: 'Соберите свои сочетания качества, формата, кодека и разрешения. Они появятся в коротком списке качества в popup.',
    en: 'Combine quality, format, codec, and resolution. Custom profiles appear in the popup quality menu.',
  },
  addProfile: {
    ru: 'Добавить профиль',
    en: 'Add profile',
  },
  builtInTitle: {
    ru: 'Готовые профили',
    en: 'Built-in profiles',
  },
  customTitle: {
    ru: 'Мои профили',
    en: 'My profiles',
  },
  customEmpty: {
    ru: 'Пользовательских профилей пока нет. Добавьте профиль, если готовых вариантов недостаточно.',
    en: 'No custom profiles yet. Add one when the built-in choices are not enough.',
  },
  activeBadge: {
    ru: 'Выбран',
    en: 'Selected',
  },
  useProfile: {
    ru: 'Выбрать',
    en: 'Use',
  },
  editProfile: {
    ru: 'Изменить профиль',
    en: 'Edit profile',
  },
  deleteProfile: {
    ru: 'Удалить профиль',
    en: 'Delete profile',
  },
  createTitle: {
    ru: 'Новый профиль качества',
    en: 'New quality profile',
  },
  editTitle: {
    ru: 'Настройка профиля качества',
    en: 'Edit quality profile',
  },
  nameLabel: {
    ru: 'Название',
    en: 'Name',
  },
  namePlaceholder: {
    ru: 'Например, Демо для клиента',
    en: 'For example, Client demo',
  },
  qualityLabel: {
    ru: 'Качество',
    en: 'Quality',
  },
  qualityLow: { ru: 'Низкое', en: 'Low' },
  qualityMedium: { ru: 'Среднее', en: 'Medium' },
  qualityHigh: { ru: 'Высокое', en: 'High' },
  qualityUltra: { ru: 'Ультра', en: 'Ultra' },
  resolutionSource: { ru: 'Исходное', en: 'Source' },
  containerLabel: {
    ru: 'Формат',
    en: 'Format',
  },
  codecLabel: {
    ru: 'Кодек',
    en: 'Codec',
  },
  resolutionLabel: {
    ru: 'Разрешение',
    en: 'Resolution',
  },
  save: {
    ru: 'Сохранить',
    en: 'Save',
  },
  cancel: {
    ru: 'Отмена',
    en: 'Cancel',
  },
  deleteTitle: {
    ru: 'Удалить профиль качества?',
    en: 'Delete quality profile?',
  },
  deleteMessage: {
    ru: 'Профиль исчезнет из настроек и popup. Текущие параметры записи останутся без изменений.',
    en: 'The profile will disappear from settings and the popup. Current recording parameters stay unchanged.',
  },
  loadError: {
    ru: 'Не удалось загрузить профили качества.',
    en: 'Failed to load quality profiles.',
  },
  saveError: {
    ru: 'Не удалось сохранить профили качества.',
    en: 'Failed to save quality profiles.',
  },
  compactName: { ru: 'Экономное', en: 'Compact' },
  optimalName: { ru: 'Оптимальное', en: 'Optimal' },
  highName: { ru: 'Высокое', en: 'High' },
  maximumName: { ru: 'Максимальное', en: 'Maximum' },
});
