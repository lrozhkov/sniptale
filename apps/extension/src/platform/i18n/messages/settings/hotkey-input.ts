import { defineMessageSource } from '../source';

export const settingsHotkeyInputMessages = defineMessageSource({
  placeholder: {
    ru: 'Нажмите комбинацию клавиш...',
    en: 'Press a key combination...',
  },
  modifierRequired: {
    ru: 'Используйте комбинацию с Ctrl, Shift или Alt',
    en: 'Use a combination with Ctrl, Shift, or Alt',
  },
  reservedCombination: {
    ru: 'Эта комбинация зарезервирована браузером',
    en: 'This shortcut is reserved by the browser',
  },
  reservedDisplay: {
    ru: 'Зарезервировано',
    en: 'Reserved',
  },
  recordingPlaceholder: {
    ru: 'Нажмите клавиши...',
    en: 'Press keys...',
  },
  clearTitle: {
    ru: 'Очистить',
    en: 'Clear',
  },
  recordingHint: {
    ru: 'Нажмите комбинацию клавиш (Esc для отмены)',
    en: 'Press a key combination (Esc to cancel)',
  },
});
