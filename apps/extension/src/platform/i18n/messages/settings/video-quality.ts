import { defineMessageSource } from '../source';

export const settingsVideoQualityMessages = defineMessageSource({
  smallerFile: { ru: 'Меньше файл', en: 'Smaller file' },
  moreDetail: { ru: 'Больше деталей', en: 'More detail' },
  codecChecking: { ru: 'Проверяем доступность кодека…', en: 'Checking codec availability…' },
  codecUnavailable: {
    ru: 'Этот кодек недоступен в текущем браузере. Выберите другой формат или кодек.',
    en: 'This codec is unavailable in this browser. Choose another format or codec.',
  },
  codecUnknown: {
    ru: 'Не удалось проверить кодек. Доступность будет проверена перед записью.',
    en: 'Could not check this codec. Availability will be checked before recording.',
  },
  advanced: { ru: 'Дополнительно: кодек', en: 'Advanced: codec' },
  mp4Purpose: { ru: 'Для обмена и видеоредакторов', en: 'For sharing and editing' },
  webmPurpose: { ru: 'Для браузеров и веба', en: 'For browsers and the web' },
  upTo: { ru: 'До', en: 'Up to' },
  geometryHelp: {
    ru: 'Маленький источник не увеличивается. 4K — до 30 кадров/с. Для исходного размера доступность зависит от выбранного источника.',
    en: 'Smaller sources are not enlarged. 4K supports up to 30 fps. Source-size availability depends on the selected source.',
  },
  compressionHelp: {
    ru: 'Выше качество — больше файл. Все варианты используют сжатие с потерями; кодек и размер проверяются перед записью.',
    en: 'Higher quality produces larger files. All options use lossy compression; codec and dimensions are checked before recording.',
  },
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
    ru: 'Новый профиль записи',
    en: 'New recording profile',
  },
  editTitle: {
    ru: 'Профиль записи',
    en: 'Edit recording profile',
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
    ru: 'Качество сжатия',
    en: 'Compression quality',
  },
  qualityLow: { ru: 'Низкое', en: 'Low' },
  qualityMedium: { ru: 'Среднее', en: 'Medium' },
  qualityHigh: { ru: 'Высокое', en: 'High' },
  qualityUltra: { ru: 'Ультра', en: 'Ultra' },
  resolutionSource: { ru: 'Исходный размер', en: 'Source size' },
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
  frameRateLabel: {
    ru: 'Частота кадров',
    en: 'Frame rate',
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
  maximumName: { ru: 'Исходный размер', en: 'Source size' },
});
