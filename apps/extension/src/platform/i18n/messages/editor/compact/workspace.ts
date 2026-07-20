import { defineMessageSource } from '../../source';

function sentence(...parts: string[]) {
  return parts.join(' ');
}

export const editorCompactWorkspaceMessages = defineMessageSource({
  workspaceColor: {
    ru: 'Цвет рабочей зоны',
    en: 'Workspace color',
  },
  workspaceBacking: {
    ru: 'Подложка',
    en: 'Backing',
  },
  neutralPresets: {
    ru: 'Нейтральные пресеты',
    en: 'Neutral presets',
  },
  workspaceDefaultHint: {
    ru: 'Изменение действует только в текущей сессии редактора.',
    en: 'This change only affects the current editor session.',
  },
  workspaceMakeDefault: {
    ru: 'Сделать по умолчанию',
    en: 'Make default',
  },
  workspaceDefaultApplied: {
    ru: 'Текущий цвет уже сохранен как значение по умолчанию.',
    en: 'The current color is already saved as the default.',
  },
  workspaceDefaultSaveFailed: {
    ru: 'Не удалось сохранить цвет для будущих сессий',
    en: 'Could not save the color for future sessions',
  },
  hideGrid: {
    ru: 'Скрыть сетку',
    en: 'Hide grid',
  },
  showGrid: {
    ru: 'Показать сетку',
    en: 'Show grid',
  },
  disableGridSnap: {
    ru: 'Отключить привязку к сетке',
    en: 'Disable grid snap',
  },
  enableGridSnap: {
    ru: 'Включить привязку к сетке',
    en: 'Enable grid snap',
  },
  disableMagnet: {
    ru: 'Отключить магнит',
    en: 'Disable magnet',
  },
  enableMagnet: {
    ru: 'Включить магнит',
    en: 'Enable magnet',
  },
  gridSize: {
    ru: 'Размер сетки',
    en: 'Grid size',
  },
  exactGridSize: {
    ru: 'Точный размер сетки',
    en: 'Exact grid size',
  },
  gridLineColor: {
    ru: 'Цвет линий сетки',
    en: 'Grid line color',
  },
  gridLines: {
    ru: 'Цвет линий',
    en: 'Grid lines',
  },
  lines: {
    ru: 'Линии',
    en: 'Lines',
  },
  grid: {
    ru: 'Сетка',
    en: 'Grid',
  },
  snap: {
    ru: 'Привязка',
    en: 'Snap',
  },
  magnet: {
    ru: 'Магнит',
    en: 'Magnet',
  },
  disableSnap: {
    ru: 'Отключить привязку',
    en: 'Disable snap',
  },
  enableSnap: {
    ru: 'Включить привязку',
    en: 'Enable snap',
  },
  technicalData: {
    ru: 'Техданные',
    en: 'Technical data',
  },
  technicalDataLayout: {
    ru: 'Расположение',
    en: 'Layout',
  },
  technicalDataLayoutColumn: {
    ru: 'Столбец',
    en: 'Column',
  },
  technicalDataLayoutRow: {
    ru: 'Строка',
    en: 'Row',
  },
  technicalDataDescription: {
    ru: sentence(
      'Техданные добавляются как предзаполненные текстовые блоки.',
      'После вставки их можно редактировать как обычный текстовый слой.'
    ),
    en: sentence(
      'Technical data is inserted as prefilled text blocks.',
      'After insertion, it can be edited like a normal text layer.'
    ),
  },
});
