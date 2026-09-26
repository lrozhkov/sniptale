import { defineShapeEntry } from './entry-builders';
import { EDITOR_RICH_SHAPE_FAMILY } from './families';
import { SCREENSHOT_MARK_GEOMETRY } from './screenshot-mark-geometry';
import { EDITOR_BUILT_IN_SHAPE_CATEGORY, type EditorBuiltInShapeCatalogEntry } from './types';

const CURSORS = [
  ['cursor-pointer', 'Указатель', 'mouse-pointer-2', 'arrow pointer стрелка указатель'],
  ['cursor-hand', 'Рука', 'pointer', 'hand pointer click рука нажатие'],
  ['cursor-move', 'Перемещение', 'move', 'move drag перемещение'],
  ['cursor-text', 'Текстовый курсор', 'text-cursor', 'text caret текст каретка'],
  [
    'cursor-resize-horizontal',
    'Размер по горизонтали',
    'move-horizontal',
    'horizontal resize размер горизонталь',
  ],
  [
    'cursor-resize-vertical',
    'Размер по вертикали',
    'move-vertical',
    'vertical resize размер вертикаль',
  ],
  [
    'cursor-resize-diagonal',
    'Размер по диагонали ↗',
    'move-diagonal',
    'diagonal resize ne sw диагональ',
  ],
  [
    'cursor-resize-diagonal-reverse',
    'Размер по диагонали ↘',
    'move-diagonal-2',
    'diagonal resize nw se диагональ',
  ],
] as const;

const STAMPS = [
  ['stamp-check', 'Готово', 'check', 'done approved check готово одобрено галочка'],
  ['stamp-error', 'Ошибка', 'circle-x', 'error rejected cross ошибка отклонено крестик'],
  ['stamp-warning', 'Внимание', 'triangle-alert', 'warning attention внимание предупреждение'],
  ['stamp-tag', 'Тег', 'tag', 'tag label тег метка ярлык'],
] as const;

type Mark = (typeof CURSORS)[number] | (typeof STAMPS)[number];

function defineScreenshotMark(mark: Mark, cursor: boolean): EditorBuiltInShapeCatalogEntry {
  const [id, label, icon, aliases] = mark;
  const entry = defineShapeEntry({
    id,
    label,
    category: cursor
      ? EDITOR_BUILT_IN_SHAPE_CATEGORY.CURSORS
      : EDITOR_BUILT_IN_SHAPE_CATEGORY.STAMPS,
    family: cursor ? EDITOR_RICH_SHAPE_FAMILY.CURSOR : EDITOR_RICH_SHAPE_FAMILY.STAMP,
    kind: id,
    geometry: SCREENSHOT_MARK_GEOMETRY[icon],
    aliases: [aliases, cursor ? 'cursor курсор' : 'stamp штамп'],
    capabilities: ['fill', 'line', 'effects'],
  });
  return {
    ...entry,
    insertDefaults: {
      ...entry.insertDefaults,
      frame: { left: 0, top: 0, width: 48, height: 48 },
      style: {
        ...entry.insertDefaults.style,
        fillTransparency: id === 'cursor-pointer' ? 0 : 1,
        lineWidth: 3,
      },
    },
  };
}

export const SCREENSHOT_MARK_ENTRIES = [
  ...CURSORS.map((mark) => defineScreenshotMark(mark, true)),
  ...STAMPS.map((mark) => defineScreenshotMark(mark, false)),
];
