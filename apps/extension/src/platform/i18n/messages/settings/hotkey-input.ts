import { defineMessageSource } from '../source';

export const settingsHotkeyInputMessages = defineMessageSource({
  placeholder: {
    ru: 'Нажмите комбинацию клавиш...',
    en: 'Press a key combination...',
  },
  modifierRequired: {
    ru: 'Используйте Ctrl, Alt или Command',
    en: 'Use Ctrl, Alt, or Command',
  },
  altGrConflict: {
    ru: 'Сочетание Ctrl + Alt недоступно',
    en: 'Ctrl + Alt combinations are unavailable',
  },
  unsupportedKey: {
    ru: 'Эту клавишу нельзя назначить',
    en: 'This key cannot be assigned',
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
    ru: 'Ctrl, Alt или Command + клавиша · Esc — отмена',
    en: 'Ctrl, Alt, or Command + key · Esc to cancel',
  },
});
