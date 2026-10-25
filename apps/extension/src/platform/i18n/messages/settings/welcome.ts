import { defineMessageSource } from '../source';

export const settingsWelcomeMessages = defineMessageSource({
  title: { ru: 'Добро пожаловать в Sniptale', en: 'Welcome to Sniptale' },
  documentTitle: { ru: 'Первоначальная настройка · Sniptale', en: 'Setup · Sniptale' },
  description: {
    ru: 'Выберите язык, тему и устройства. Всё это можно изменить позже в настройках.',
    en: 'Choose your language, theme and devices. You can change them later in Settings.',
  },
  progress: { ru: 'Шаги первоначальной настройки', en: 'Setup steps' },
  appearance: { ru: 'Язык и тема', en: 'Language and theme' },
  devices: { ru: 'Микрофон и камера', en: 'Microphone and camera' },
  ready: { ru: 'Готово', en: 'Ready' },
  microphone: { ru: 'Микрофон', en: 'Microphone' },
  camera: { ru: 'Камера', en: 'Camera' },
  microphonePurpose: {
    ru: 'Для голосового ввода и звука в видеозаписях. Доступ запрашивается только по нажатию кнопки.',
    en: 'For dictation and audio in video recordings. Use the button to request access.',
  },
  cameraPurpose: {
    ru: 'Для записи с веб-камеры. Разрешение не включает камеру для записи автоматически.',
    en: 'For webcam recordings. Permission does not automatically enable camera recording.',
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
    ru: 'Доступы необязательны. Запросите их сейчас или при первом использовании устройства.',
    en: 'Device access is optional. Grant it now or when you first use a device.',
  },
  granted: { ru: 'Доступ разрешён', en: 'Access allowed' },
  denied: {
    ru: 'Доступ отклонён. Измените разрешение в настройках браузера и повторите запрос.',
    en: 'Access denied. Change the permission in browser settings, then try again.',
  },
  prompt: { ru: 'Доступ ещё не получен', en: 'Access not yet granted' },
  unavailable: {
    ru: 'Устройство недоступно. Проверьте подключение и повторите запрос.',
    en: 'Device unavailable. Check its connection and try again.',
  },
  busy: {
    ru: 'Устройство занято. Завершите его использование в другом приложении и повторите запрос.',
    en: 'Device in use. Release it in the other app and try again.',
  },
  loading: { ru: 'Загружаю настройки устройств…', en: 'Loading device settings…' },
  loadError: {
    ru: 'Не удалось загрузить настройки устройств. Повторите загрузку или настройте устройства позже.',
    en: 'Device settings could not load. Retry or configure devices later.',
  },
  saveError: {
    ru: 'Не все настройки сохранены. Завершённые изменения сохранены. Повторите действие или продолжите позже.',
    en: 'Some settings could not save. Completed changes remain saved. Retry or continue later.',
  },
  retry: { ru: 'Повторить загрузку', en: 'Retry loading' },
  next: { ru: 'Продолжить', en: 'Continue' },
  back: { ru: 'Назад', en: 'Back' },
  skip: { ru: 'Настроить позже', en: 'Set up later' },
  finish: { ru: 'Открыть настройки', en: 'Open Settings' },
  saving: { ru: 'Сохраняю…', en: 'Saving…' },
  readyDescription: {
    ru: 'Первоначальная настройка сохранена. Разрешения и устройства можно изменить в настройках браузера и Sniptale.',
    en: 'Your setup is saved. You can change permissions and devices in browser settings and Sniptale.',
  },
});
