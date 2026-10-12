import { defineMessageSource } from '../source';

/** Built-in action sounds and their actionable loading/admission feedback. */
export const galleryVideoReviewActionAudioMessages = defineMessageSource({
  exportSourceVideo: { ru: 'Исходное видео', en: 'Source video' },
  actionAudio: { ru: 'Звук действия', en: 'Action sound' },
  actionAudioEnabled: { ru: 'Применять звук', en: 'Apply sound' },
  actionAudioOn: { ru: 'Включён', en: 'On' },
  actionAudioOff: { ru: 'Выключен', en: 'Off' },
  actionAudioNone: { ru: 'Не выбран', en: 'None' },
  actionAudioMouse: { ru: 'Мышь', en: 'Mouse' },
  actionAudioKeyboard: { ru: 'Клавиши', en: 'Keys' },
  actionAudioTyping: { ru: 'Ввод текста', en: 'Typing' },
  actionAudioMouseClassic: { ru: 'Обычный щелчок', en: 'Classic click' },
  actionAudioMouseAlternate: { ru: 'Чёткий щелчок', en: 'Crisp click' },
  actionAudioMouseSoft: { ru: 'Мягкий щелчок', en: 'Soft click' },
  actionAudioKeyboardNatural: { ru: 'Естественное нажатие', en: 'Natural key' },
  actionAudioTypingNatural: { ru: 'Естественный ввод', en: 'Natural typing' },
  actionAudioListen: { ru: 'Прослушать', en: 'Listen' },
  actionAudioVolume: { ru: 'Громкость звука', en: 'Sound volume' },
  actionAudioOffset: { ru: 'Смещение звука', en: 'Sound offset' },
  actionAudioReset: { ru: 'Сбросить звук', en: 'Reset sound' },
  actionAudioSettingsLimit: {
    ru: 'Не удалось сохранить настройки звука. Проверьте выбранные значения и число действий.',
    en: 'Sound settings could not be saved. Check the selected values and number of actions.',
  },
  actionAudioLimit: {
    ru: 'Слишком много одновременных звуков действий. Отключите часть звуков.',
    en: 'Too many action sounds overlap. Disable some sounds.',
  },
  actionAudioResource: {
    ru: 'Не удалось загрузить выбранный звук действия. Попробуйте ещё раз.',
    en: 'The selected action sound could not be loaded. Try again.',
  },
});
