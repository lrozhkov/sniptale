import { defineMessageSource } from '../source';

export const settingsWelcomeMessages = defineMessageSource({
  title: { ru: 'Добро пожаловать!', en: 'Welcome!' },
  documentTitle: { ru: 'Первоначальная настройка · Sniptale', en: 'Setup · Sniptale' },
  description: {
    ru: 'Пара настроек под вас — и можно начинать. Всё можно изменить позже.',
    en: 'A few choices to make Sniptale yours. You can change them any time.',
  },
  pinTitle: { ru: 'Sniptale под рукой', en: 'Keep Sniptale close' },
  pinDescription: {
    ru: 'Закрепите расширение, чтобы открывать его одним нажатием.',
    en: 'Pin the extension to open it with one click.',
  },
  pinMenu: {
    ru: 'Откройте меню расширений — значок пазла на панели браузера.',
    en: 'Open the Extensions menu using the puzzle icon in your browser toolbar.',
  },
  pinAction: {
    ru: 'Нажмите значок закрепления рядом со Sniptale.',
    en: 'Click the pin next to Sniptale.',
  },
  pinIllustration: {
    ru: 'Закрепление Sniptale в меню расширений браузера',
    en: 'Pinning Sniptale from the browser Extensions menu',
  },
  moreSettings: {
    ru: 'Горячие клавиши, запись, сохранение и AI можно настроить под себя.',
    en: 'Make shortcuts, recording, saving and AI work your way.',
  },
  allSettings: { ru: 'Все настройки', en: 'All settings' },
  progress: { ru: 'Шаги первоначальной настройки', en: 'Setup steps' },
  languageLabel: { ru: 'Язык', en: 'Language' },
  themeLabel: { ru: 'Тема', en: 'Theme' },
  devicesTitle: { ru: 'Настроим доступ', en: 'Set up access' },
  devices: { ru: 'Микрофон и камера', en: 'Microphone and camera' },
  ready: { ru: 'Готово', en: 'Ready' },
  microphone: { ru: 'Микрофон', en: 'Microphone' },
  camera: { ru: 'Камера', en: 'Camera' },
  microphonePurpose: {
    ru: 'Для голосового ввода и звука в видеозаписях.',
    en: 'For dictation and audio in video recordings.',
  },
  cameraPurpose: {
    ru: 'Для записи видео с веб-камеры.',
    en: 'For webcam video recordings.',
  },
  allowMicrophone: { ru: 'Разрешить микрофон', en: 'Allow microphone' },
  allowCamera: { ru: 'Разрешить камеру', en: 'Allow camera' },
  defaultCamera: { ru: 'Камера по умолчанию', en: 'Default camera' },
  unnamedMicrophone: { ru: 'Микрофон без названия', en: 'Unnamed microphone' },
  unnamedCamera: { ru: 'Камера без названия', en: 'Unnamed camera' },
  selectedUnavailable: { ru: 'Выбранное устройство недоступно', en: 'Selected device unavailable' },
  noDevices: {
    ru: 'Устройства не найдены. Подключите устройство или пропустите этот шаг.',
    en: 'No devices found. Connect a device or skip this step.',
  },
  optional: {
    ru: 'Выберите, что включить. Эти разрешения можно изменить позже.',
    en: 'Choose what to enable. You can change these permissions later.',
  },
  granted: { ru: 'Доступ разрешён', en: 'Access allowed' },
  denied: {
    ru: 'Доступ закрыт',
    en: 'Access denied',
  },
  deniedHelp: {
    ru: 'Чтобы разрешить микрофон или камеру, измените доступ в настройках браузера и повторите запрос.',
    en: 'To allow your microphone or camera, change access in browser settings and try again.',
  },
  pageTools: { ru: 'Инструменты во вкладках', en: 'Tools in tabs' },
  pageToolsPurpose: {
    ru: 'Включать Sniptale на всех сайтах без отдельного запроса.',
    en: 'Enable Sniptale on all sites without asking each time.',
  },
  pageAccessError: {
    ru: 'Не удалось включить. Повторите запрос.',
    en: 'Could not enable access. Try again.',
  },
  prompt: { ru: 'Не включено', en: 'Not enabled' },
  unavailable: {
    ru: 'Устройство недоступно. Проверьте подключение и повторите запрос.',
    en: 'Device unavailable. Check its connection and try again.',
  },
  busy: {
    ru: 'Устройство занято. Завершите его использование в другом приложении и повторите запрос.',
    en: 'Device in use. Release it in the other app and try again.',
  },
  loading: { ru: 'Проверяю разрешения…', en: 'Checking access…' },
  loadError: {
    ru: 'Не удалось проверить разрешения. Повторите проверку или настройте доступ позже.',
    en: 'Could not check access. Try again or set it up later.',
  },
  saveError: {
    ru: 'Не удалось сохранить выбор. Повторите действие или настройте позже.',
    en: 'Could not save your choice. Try again or set it up later.',
  },
  retry: { ru: 'Повторить загрузку', en: 'Retry loading' },
  nextDevices: { ru: 'Продолжить', en: 'Continue' },
  back: { ru: 'Назад', en: 'Back' },
  skip: { ru: 'Настроить позже', en: 'Set up later' },
  finish: { ru: 'Начать работу', en: 'Get started' },
  saving: { ru: 'Сохраняю…', en: 'Saving…' },
  readyDescription: {
    ru: 'Первоначальная настройка сохранена. Разрешения и устройства можно изменить в настройках браузера и Sniptale.',
    en: 'Your setup is saved. You can change permissions and devices in browser settings and Sniptale.',
  },
});
