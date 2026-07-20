import { defineMessageSource } from '../source';

export const contentAutoBlurMessages = defineMessageSource({
  title: {
    ru: 'Auto-Blur',
    en: 'Auto-Blur',
  },
  scanError: {
    ru: 'Не удалось просканировать видимый текст',
    en: 'Failed to scan visible text',
  },
  applyError: {
    ru: 'Не удалось применить Auto-Blur',
    en: 'Failed to apply Auto-Blur',
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
    ru: 'Blur уже установлен',
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
    ru: 'Сила blur',
    en: 'Blur strength',
  },
  showBorder: {
    ru: 'Показывать рамку',
    en: 'Show border',
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
    ru: 'Работает при закрепленной панели или активном сценарии',
    en: 'Works when the toolbar is pinned or scenario mode is active',
  },
  autoApplyBlockedHint: {
    ru: 'Закрепите панель за вкладкой или включите сценарий',
    en: 'Pin the toolbar to the tab or enable scenario mode',
  },
  applyOnce: {
    ru: 'Применить разово',
    en: 'Apply once',
  },
  applyOnceHint: {
    ru: 'Использует текущие настройки',
    en: 'Uses current settings',
  },
  configure: {
    ru: 'Настроить',
    en: 'Configure',
  },
  configureHint: {
    ru: 'Категории, найденные элементы и параметры blur',
    en: 'Categories, detected items, and blur settings',
  },
});
