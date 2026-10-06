import { defineMessageSource } from './source';
export const windowHeaderMessages = defineMessageSource({
  enabled: { en: 'Window header', ru: 'Шапка окна' },
  reset: { en: 'Reset', ru: 'Сбросить' },
  none: { en: 'Off', ru: 'Выключено' },
  type: { en: 'Type', ru: 'Тип' },
  browser: { en: 'Browser', ru: 'Браузер' },
  application: { en: 'Application', ru: 'Приложение' },
  style: { en: 'Style', ru: 'Стиль' },
  windows: { en: 'Windows', ru: 'Windows' },
  macos: { en: 'macOS', ru: 'macOS' },
  linux: { en: 'Linux', ru: 'Linux' },
  theme: { en: 'Theme', ru: 'Тема' },
  light: { en: 'Light', ru: 'Светлая' },
  dark: { en: 'Dark', ru: 'Тёмная' },
  tabTitle: { en: 'Tab title', ru: 'Название вкладки' },
  windowTitle: { en: 'Window title', ru: 'Заголовок окна' },
  address: { en: 'Website address', ru: 'Адрес сайта' },
  favicon: { en: 'Use website icon', ru: 'Использовать иконку сайта' },
  loading: { en: 'Loading website icon…', ru: 'Загрузка иконки сайта…' },
  unavailable: {
    en: 'Could not load the website icon. Check the address and turn the icon off and on to retry.',
    ru: 'Не удалось загрузить иконку сайта. Проверьте адрес и выключите и включите иконку для повтора.',
  },
  updateFailed: {
    en: 'Could not update the window header. Try again.',
    ru: 'Не удалось обновить шапку окна. Попробуйте ещё раз.',
  },
});
