// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InsertStepActions } from './insert-step-actions';

vi.mock('../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderActions(onInsert = vi.fn(), onInsertImage = vi.fn()) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<InsertStepActions index={4} onInsert={onInsert} onInsertImage={onInsertImage} />);
  });

  return { onInsert, onInsertImage };
}

function click(label: string) {
  act(() => {
    container?.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.click();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('routes insert actions to the expected index and step kinds', () => {
  const { onInsert, onInsertImage } = renderActions();

  click('scenario.editor.addImage');
  click('scenario.editor.addSection');
  click('scenario.editor.addNote');
  click('scenario.editor.addDivider');

  expect(onInsertImage).toHaveBeenCalledWith(4);
  expect(onInsert).toHaveBeenNthCalledWith(1, 4, 'section');
  expect(onInsert).toHaveBeenNthCalledWith(2, 4, 'note');
  expect(onInsert).toHaveBeenNthCalledWith(3, 4, 'divider');
});

it('renders the translated action labels as accessible button names', () => {
  renderActions();

  expect(
    container?.querySelector<HTMLButtonElement>('[aria-label="scenario.editor.addImage"]')
  ).not.toBeNull();
  expect(
    container?.querySelector<HTMLButtonElement>('[aria-label="scenario.editor.addSection"]')
  ).not.toBeNull();
  expect(
    container?.querySelector<HTMLButtonElement>('[aria-label="scenario.editor.addNote"]')
  ).not.toBeNull();
  expect(
    container?.querySelector<HTMLButtonElement>('[aria-label="scenario.editor.addDivider"]')
  ).not.toBeNull();
});
