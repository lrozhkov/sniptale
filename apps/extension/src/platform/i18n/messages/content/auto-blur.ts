import { defineMessageSource } from '../source';

export const contentAutoBlurMessages = defineMessageSource({
  title: {
    ru: 'Автоматическое размытие данных',
    en: 'Automatic data blur',
  },
  scanError: {
    ru: 'Не удалось просканировать видимый текст',
    en: 'Failed to scan visible text',
  },
  applyError: {
    ru: 'Не удалось применить автоматическое размытие',
    en: 'Failed to apply automatic blur',
  },
  loading: {
    ru: 'Поиск сущностей',
    en: 'Scanning entities',
  },
  empty: {
    ru: 'Сущности не найдены',
    en: 'No entities found',
  },
  categoryColumn: {
    ru: 'Категория',
    en: 'Category',
  },
  valueColumn: {
    ru: 'Элемент',
    en: 'Element',
  },
  statusColumn: {
    ru: 'Статус',
    en: 'Status',
  },
  alreadyBlurred: {
    ru: 'Размытие уже применено',
    en: 'Already blurred',
  },
  noMatches: {
    ru: 'Нет найденных элементов',
    en: 'No detected items',
  },
  readyStatus: {
    ru: 'Готово',
    en: 'Ready',
  },
  categoriesTitle: {
    ru: 'Всегда применять категории',
    en: 'Always apply categories',
  },
  rowsTitle: {
    ru: 'Элементы текущей страницы',
    en: 'Current page elements',
  },
  expandAllButton: {
    ru: 'Развернуть все',
    en: 'Expand all',
  },
  collapseAllButton: {
    ru: 'Свернуть все',
    en: 'Collapse all',
  },
  expandAllTitle: {
    ru: 'Развернуть все категории',
    en: 'Expand all categories',
  },
  collapseAllTitle: {
    ru: 'Свернуть все категории',
    en: 'Collapse all categories',
  },
  selectAllButton: {
    ru: 'Выбрать все',
    en: 'Select all',
  },
  clearSelectionButton: {
    ru: 'Снять выбор',
    en: 'Clear selection',
  },
  selectAllTitle: {
    ru: 'Выбрать все категории и элементы',
    en: 'Select all categories and items',
  },
  clearSelectionTitle: {
    ru: 'Снять выбор со всех категорий и элементов',
    en: 'Clear all selected categories and items',
  },
  expandCategoryTitle: {
    ru: 'Развернуть категорию',
    en: 'Expand category',
  },
  collapseCategoryTitle: {
    ru: 'Свернуть категорию',
    en: 'Collapse category',
  },
  blurStrength: {
    ru: 'Сила размытия',
    en: 'Blur strength',
  },
  blurType: {
    ru: 'Тип размытия',
    en: 'Blur type',
  },
  showBorder: {
    ru: 'Рамка и заливка',
    en: 'Frame and fill',
  },
  frameTemplate: {
    ru: 'Шаблон рамки',
    en: 'Frame template',
  },
  appearanceTitle: {
    ru: 'Оформление размытия',
    en: 'Blur appearance',
  },
  appearanceDescription: {
    ru: 'Эти параметры применятся ко всем выбранным элементам.',
    en: 'These settings will be applied to all selected items.',
  },
  reset: {
    ru: 'Сбросить размытие',
    en: 'Clear blur',
  },
  apply: {
    ru: 'Применить',
    en: 'Apply',
  },
  cancel: {
    ru: 'Отмена',
    en: 'Cancel',
  },
  categoryEmail: {
    ru: 'Email',
    en: 'Email',
  },
  categoryPhone: {
    ru: 'Телефон',
    en: 'Phone',
  },
  categoryUrlOrLogin: {
    ru: 'URL / логин',
    en: 'URL / login',
  },
  categoryIpAddress: {
    ru: 'IP-адрес',
    en: 'IP address',
  },
  categoryBankCard: {
    ru: 'Банковская карта',
    en: 'Bank card',
  },
  categoryDocumentNumber: {
    ru: 'Номера документов',
    en: 'Document numbers',
  },
  categoryCount: {
    ru: 'Найдено: {count}',
    en: 'Found: {count}',
  },
  autoApplyEnabled: {
    ru: 'Включить авто-размытие',
    en: 'Enable auto-blur',
  },
  autoApplyDisabled: {
    ru: 'Выключить авто-размытие',
    en: 'Disable auto-blur',
  },
  autoApplyEnableHint: {
    ru: 'Автоматически размывать найденные данные перед каждым снимком',
    en: 'Automatically blur detected data before every screenshot',
  },
  autoApplyBlockedHint: {
    ru: 'Сначала закрепите панель во вкладке или включите сценарий',
    en: 'Pin the toolbar to this tab or turn on scenario mode first',
  },
  applyOnce: {
    ru: 'Размыть данные сейчас',
    en: 'Blur data now',
  },
  applyOnceSuccess: {
    ru: 'Найденные данные скрыты: {count}',
    en: 'Detected data blurred: {count}',
  },
  applyOnceEmpty: {
    ru: 'Данные для размытия не найдены',
    en: 'No data to blur found',
  },
  applyOnceError: {
    ru: 'Не удалось найти и размыть данные',
    en: 'Could not find and blur data',
  },
  applyOnceHint: {
    ru: 'Найти и размыть данные на текущей странице',
    en: 'Find and blur data on the current page',
  },
  configure: {
    ru: 'Настроить',
    en: 'Configure',
  },
  configureHint: {
    ru: 'Выбрать типы данных, проверить найденное и настроить размытие',
    en: 'Choose data types, review matches, and adjust blur',
  },
});
