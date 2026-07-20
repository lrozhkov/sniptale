import { defineMessageSource } from '../source';
import { settingsPageStylePropertyMessages } from './page-styles-properties';

export const settingsPageStylesMessages = defineMessageSource({
  subtitle: {
    ru: 'Правила восстановления стилей, сохранённые из режима редактирования страницы.',
    en: 'Style restore rules saved from page editing mode.',
  },
  searchLabel: {
    ru: 'Поиск по адресу, домену или селектору',
    en: 'Search by address, domain, or selector',
  },
  searchPlaceholder: {
    ru: 'example.com, /orders или .card-title',
    en: 'example.com, /orders, or .card-title',
  },
  propertyLabel: {
    ru: 'Свойство',
    en: 'Property',
  },
  addressLabel: {
    ru: 'Адрес или домен',
    en: 'Address or domain',
  },
  addressPlaceholder: {
    ru: 'example.com или /orders',
    en: 'example.com or /orders',
  },
  statusLabel: {
    ru: 'Статус',
    en: 'Status',
  },
  allProperties: {
    ru: 'Все свойства',
    en: 'All properties',
  },
  properties: settingsPageStylePropertyMessages,
  allStatuses: {
    ru: 'Все правила',
    en: 'All rules',
  },
  enabled: {
    ru: 'Включено',
    en: 'Enabled',
  },
  disabled: {
    ru: 'Выключено',
    en: 'Disabled',
  },
  contentRetaining: {
    ru: 'С сохранением контента',
    en: 'Retains content',
  },
  assetBacked: {
    ru: 'С ассетами',
    en: 'Has assets',
  },
  exactScope: {
    ru: 'Точный адрес',
    en: 'Exact address',
  },
  domainScope: {
    ru: 'Домен',
    en: 'Domain',
  },
  exactAddressLabel: {
    ru: 'Точный адрес',
    en: 'Exact address',
  },
  domainLabel: {
    ru: 'Домен',
    en: 'Domain',
  },
  domainPlaceholder: {
    ru: 'example.com',
    en: 'example.com',
  },
  selectorLabel: {
    ru: 'Селектор',
    en: 'Selector',
  },
  propertiesLabel: {
    ru: 'Свойства',
    en: 'Properties',
  },
  retentionText: {
    ru: 'Текст сохранён явно',
    en: 'Text explicitly retained',
  },
  retentionImage: {
    ru: 'Изображение сохранено в ассетах',
    en: 'Image retained as an asset',
  },
  assetReferences: {
    ru: 'Ссылки на ассеты',
    en: 'Asset references',
  },
  createdAt: {
    ru: 'Создано',
    en: 'Created',
  },
  updatedAt: {
    ru: 'Обновлено',
    en: 'Updated',
  },
  saveScope: {
    ru: 'Сохранить область',
    en: 'Save scope',
  },
  useExact: {
    ru: 'Применять к адресу',
    en: 'Apply to address',
  },
  useDomain: {
    ru: 'Применять к домену',
    en: 'Apply to domain',
  },
  clearDomain: {
    ru: 'Убрать домен',
    en: 'Remove domain',
  },
  deleteRule: {
    ru: 'Удалить правило',
    en: 'Delete rule',
  },
  emptyTitle: {
    ru: 'Правил восстановления пока нет',
    en: 'No restore rules yet',
  },
  emptyFilteredTitle: {
    ru: 'Правила не найдены',
    en: 'No rules found',
  },
  loadError: {
    ru: 'Не удалось загрузить стили страницы.',
    en: 'Failed to load page styles.',
  },
  saveError: {
    ru: 'Не удалось сохранить изменения правила.',
    en: 'Failed to save rule changes.',
  },
  deleteError: {
    ru: 'Не удалось удалить правило.',
    en: 'Failed to delete rule.',
  },
  deletedWithCleanupWarning: {
    ru: 'Правило удалено, но часть ассетов не удалось очистить.',
    en: 'Rule deleted, but some assets could not be cleaned up.',
  },
  saved: {
    ru: 'Изменения сохранены.',
    en: 'Changes saved.',
  },
  deleted: {
    ru: 'Правило удалено.',
    en: 'Rule deleted.',
  },
});
