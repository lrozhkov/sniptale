import { expect } from 'vitest';

const FILE_MENU_GROUP_ORDER = [
  'editor.file-actions.group.primary-save',
  'editor.file-actions.group.save-utilities',
  'editor.file-actions.group.quick-destinations',
  'editor.file-actions.group.image-format',
  'editor.file-actions.group.session',
  'editor.file-actions.group.open-image',
  'editor.file-actions.group.close',
];

const FILE_MENU_BUTTON_ORDER = [
  'editor.file-actions.action.save-image',
  'editor.file-actions.action.save-image-as',
  'editor.file-actions.action.copy-png',
  'editor.file-actions.action.export-session',
  'editor.file-actions.action.import-session',
  'editor.file-actions.action.open-image',
  'editor.file-actions.action.close-file',
];

function getDataUiList(selector: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).map(
    (element) => element.dataset['ui']
  );
}

function getFileMenuGroup(groupId: string) {
  return document.querySelector<HTMLElement>(`[data-ui="editor.file-actions.group.${groupId}"]`);
}

export function expectFileMenuGroupOrder() {
  expect(getDataUiList('[data-ui^="editor.file-actions.group."]')).toEqual(FILE_MENU_GROUP_ORDER);
}

export function expectFileMenuDividers() {
  for (const groupId of ['primary-save', 'save-utilities', 'open-image', 'close']) {
    expect(getFileMenuGroup(groupId)?.className).not.toContain('border-b');
  }

  for (const groupId of ['quick-destinations', 'image-format', 'session']) {
    expect(getFileMenuGroup(groupId)?.className).toContain('border-b');
  }
}

export function expectFileMenuFormatContent() {
  const formatContent = document.querySelector<HTMLElement>(
    '[data-ui="editor.file-actions.content.image-format"]'
  );
  const formatButtons = formatContent?.querySelectorAll(
    'section[aria-label="Формат изображения"] button[aria-pressed]'
  );
  expect(formatContent?.textContent).toContain('Формат изображения');
  expect(formatButtons).toHaveLength(3);
}

export function expectFileMenuButtonOrder() {
  expect(getDataUiList('[data-ui^="editor.file-actions.action."]')).toEqual(FILE_MENU_BUTTON_ORDER);
}

export function expectFileMenuKeyActionStates() {
  const saveButton = document.querySelector<HTMLButtonElement>(
    '[data-ui="editor.file-actions.action.save-image"]'
  );
  expect(saveButton?.dataset['emphasis']).toBe('primary');
  expect(getFileMenuGroup('quick-destinations')?.textContent).toContain('Сохранить в папку');
  expect(getFileMenuGroup('quick-destinations')?.textContent).not.toContain('Команда');

  const closeButton = document.querySelector<HTMLButtonElement>(
    '[data-ui="editor.file-actions.action.close-file"]'
  );
  expect(closeButton?.dataset['tone']).toBe('default');
}
