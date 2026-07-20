import { defineMessageSource } from '../source';

export const videoEditorDiagnosticsMessages = defineMessageSource({
  notFound: {
    ru: 'Диагностика не найдена',
    en: 'Diagnostics not found',
  },
  loadError: {
    ru: 'Ошибка загрузки',
    en: 'Loading error',
  },
  reportTitle: {
    ru: 'Отчёт по диагностике',
    en: 'Diagnostics report',
  },
  recordingIdLabel: {
    ru: 'Идентификатор записи',
    en: 'Recording ID',
  },
  metadataTitle: {
    ru: 'Метаданные',
    en: 'Metadata',
  },
  startedLabel: {
    ru: 'Начало',
    en: 'Started',
  },
  endedLabel: {
    ru: 'Завершение',
    en: 'Ended',
  },
  interruptedLabel: {
    ru: 'Прервано',
    en: 'Interrupted',
  },
  yes: {
    ru: 'Да',
    en: 'Yes',
  },
  no: {
    ru: 'Нет',
    en: 'No',
  },
  statsTitle: {
    ru: 'Статистика',
    en: 'Statistics',
  },
  totalEventsLabel: {
    ru: 'Всего событий',
    en: 'Total events',
  },
  errorsLabel: {
    ru: 'Ошибок',
    en: 'Errors',
  },
  warningsLabel: {
    ru: 'Предупреждений',
    en: 'Warnings',
  },
  networkLabel: {
    ru: 'Сетевых запросов',
    en: 'Network requests',
  },
  consoleLabel: {
    ru: 'Сообщений консоли',
    en: 'Console messages',
  },
  actionsLabel: {
    ru: 'Действий пользователя',
    en: 'User actions',
  },
  reportErrorsTitle: {
    ru: 'Ошибки',
    en: 'Errors',
  },
  zipFallbackAlert: {
    ru: 'Не удалось экспортировать ZIP. Переключаюсь на JSON.',
    en: 'Failed to export ZIP. Falling back to JSON.',
  },
  loading: {
    ru: 'Загрузка диагностики...',
    en: 'Loading diagnostics...',
  },
  empty: {
    ru: 'Диагностика не собиралась для этой записи',
    en: 'Diagnostics were not collected for this recording',
  },
  title: {
    ru: 'Диагностика',
    en: 'Diagnostics',
  },
  eventsSuffix: {
    ru: 'событий',
    en: 'events',
  },
  exporting: {
    ru: 'Экспорт...',
    en: 'Exporting...',
  },
  exportDisclosure: {
    ru: [
      'Экспорт сохраняет JSON/ZIP с sanitized browser activity diagnostics:',
      'tab URL, console/errors, network requests/failures и service logs из local IndexedDB.',
    ].join(' '),
    en: [
      'Export downloads JSON/ZIP with sanitized browser activity diagnostics:',
      'tab URL, console/errors, network requests/failures, and service logs from local IndexedDB.',
    ].join(' '),
  },
  filterAll: {
    ru: 'Все',
    en: 'All',
  },
  filterErrors: {
    ru: 'Ошибки',
    en: 'Errors',
  },
  filterWarnings: {
    ru: 'Предупр.',
    en: 'Warnings',
  },
  filterNetwork: {
    ru: 'Сеть',
    en: 'Network',
  },
  filterConsole: {
    ru: 'Консоль',
    en: 'Console',
  },
  emptyFiltered: {
    ru: 'Нет событий для отображения',
    en: 'No events to display',
  },
  interruptedBadge: {
    ru: 'Прервано',
    en: 'Interrupted',
  },
  notAvailable: {
    ru: 'н/д',
    en: 'n/a',
  },
  noTextFallbackPrefix: {
    ru: 'Без текста',
    en: 'No text',
  },
  clickPrefix: {
    ru: 'Клик по',
    en: 'Click on',
  },
  textInputPrefix: {
    ru: 'Ввод текста в',
    en: 'Text input in',
  },
  changePrefix: {
    ru: 'Изменение в',
    en: 'Change in',
  },
  scrollUp: {
    ru: 'Прокрутка вверх',
    en: 'Scroll up',
  },
  scrollDown: {
    ru: 'Прокрутка вниз',
    en: 'Scroll down',
  },
  roleButton: {
    ru: 'кнопка',
    en: 'button',
  },
  roleLink: {
    ru: 'ссылка',
    en: 'link',
  },
  roleInput: {
    ru: 'поле ввода',
    en: 'input',
  },
  roleCheckbox: {
    ru: 'чекбокс',
    en: 'checkbox',
  },
  roleRadio: {
    ru: 'радиокнопка',
    en: 'radio button',
  },
  roleSelect: {
    ru: 'выпадающий список',
    en: 'select',
  },
  roleTab: {
    ru: 'вкладка',
    en: 'tab',
  },
  roleMenu: {
    ru: 'меню',
    en: 'menu',
  },
  roleMenuItem: {
    ru: 'пункт меню',
    en: 'menu item',
  },
  roleIcon: {
    ru: 'иконка',
    en: 'icon',
  },
  roleText: {
    ru: 'текст',
    en: 'text',
  },
  roleImage: {
    ru: 'изображение',
    en: 'image',
  },
  keyEnter: {
    ru: 'Нажат Enter',
    en: 'Pressed Enter',
  },
  keyEscape: {
    ru: 'Нажат Escape (отмена)',
    en: 'Pressed Escape (cancel)',
  },
  keyTab: {
    ru: 'Нажат Tab',
    en: 'Pressed Tab',
  },
  keyBackspace: {
    ru: 'Нажат Backspace',
    en: 'Pressed Backspace',
  },
  keyDelete: {
    ru: 'Нажат Delete',
    en: 'Pressed Delete',
  },
  keyArrowUp: {
    ru: 'Нажата стрелка вверх',
    en: 'Pressed Arrow Up',
  },
  keyArrowDown: {
    ru: 'Нажата стрелка вниз',
    en: 'Pressed Arrow Down',
  },
  keyArrowLeft: {
    ru: 'Нажата стрелка влево',
    en: 'Pressed Arrow Left',
  },
  keyArrowRight: {
    ru: 'Нажата стрелка вправо',
    en: 'Pressed Arrow Right',
  },
  hotkeyPrefix: {
    ru: 'Нажато сочетание',
    en: 'Pressed shortcut',
  },
  keyPressPrefix: {
    ru: 'Нажата клавиша',
    en: 'Pressed key',
  },
  keyGenericPrefix: {
    ru: 'Нажата клавиша',
    en: 'Pressed key',
  },
});
