// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DesignReviewActions, DesignReviewViewState } from '../types';
import { DesignReviewSettings } from './view';

const actions: DesignReviewActions = {
  close: vi.fn(),
  comment: {
    commit: vi.fn(() => true),
    endComposition: vi.fn(),
    startComposition: vi.fn(),
    updateDraft: vi.fn(),
  },
  copyElement: vi.fn(async () => undefined),
  copyPath: vi.fn(async () => undefined),
  delete: vi.fn(),
  resetValue: vi.fn(),
  selectAction: vi.fn(),
  setSettingsOpen: vi.fn(),
  setSideFieldLinked: vi.fn(),
  updateValue: vi.fn(),
  updateValues: vi.fn(),
};

const state: DesignReviewViewState = {
  action: 'refine',
  anchor: { x: 40, y: 40 },
  comment: { commitFailed: false, draft: '', marker: null },
  defaultValues: { color: 'rgb(0, 0, 0)', height: '40px', width: '120px' },
  draftPatch: { declarations: [] },
  modifiedProperties: [],
  selection: {
    domPath: 'html > body > main > h1:nth-of-type(1)',
    element: document.createElement('h1'),
    kind: 'text',
    patch: { declarations: [] },
    selectorLabel: 'h1:nth-of-type(1)',
    tagName: 'h1',
    textPreview: 'Heading',
  },
  settingsOpen: true,
  values: { color: 'rgb(0, 0, 0)', height: '40px', width: '120px' },
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('uses compact non-collapsible navigation and renders only the active logical group', () => {
  act(() => root.render(<DesignReviewSettings actions={actions} disabled={false} state={state} />));

  const navigation = container.querySelector('nav');
  expect(navigation?.querySelectorAll('button')).toHaveLength(4);
  expect(container.querySelector('details')).toBeNull();
  expect(container.querySelector('summary')).toBeNull();
  expect(container.textContent).toContain('Цвет');
  expect(container.textContent).not.toContain('Ширина');

  const layoutButton = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Размер и отступы"]'
  );
  act(() => layoutButton?.click());

  expect(container.textContent).toContain('Ширина');
  expect(container.textContent).toContain('Высота');
  expect(container.textContent).not.toContain('Цвет');
  expect(container.querySelectorAll('[data-ui="content.design-review.side-field"]')).toHaveLength(
    2
  );
  expect(container.querySelector('[data-ui="content.design-review.side-values"]')).toBeNull();
  expect(container.querySelector('[data-ui="content.design-review.field"]')?.className).toContain(
    'grid-cols-[7rem_minmax(0,1fr)]'
  );
  expect(container.querySelector('input[type="file"]')).toBeNull();
});

it('separates fill effects from borders so each section stays focused', () => {
  act(() => root.render(<DesignReviewSettings actions={actions} disabled={false} state={state} />));

  const appearanceButton = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Фон и эффекты"]'
  );
  act(() => appearanceButton?.click());
  expect(container.textContent).toContain('Цвет фона');
  expect(container.textContent).toContain('Тень');
  expect(container.textContent).not.toContain('Толщина');

  const borderButton = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Границы и скругление"]'
  );
  act(() => borderButton?.click());
  expect(container.textContent).toContain('Толщина');
  expect(container.textContent).toContain('Цвет рамки');
  expect(container.textContent).toContain('Скругление');
  expect(container.textContent).not.toContain('Цвет фона');
});

it('shows image layout properties without preview or asset-upload controls', () => {
  const imageState: DesignReviewViewState = {
    ...state,
    selection: {
      ...state.selection!,
      element: document.createElement('img'),
      kind: 'image',
      tagName: 'img',
    },
  };
  act(() =>
    root.render(<DesignReviewSettings actions={actions} disabled={false} state={imageState} />)
  );

  expect(container.querySelector('nav')?.querySelectorAll('button')).toHaveLength(5);
  expect(container.textContent).toContain('Вписывание');
  expect(container.textContent).toContain('Позиция');
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('input[type="file"]')).toBeNull();

  act(() => root.render(<DesignReviewSettings actions={actions} disabled={false} state={state} />));
  expect(container.textContent).toContain('Цвет');
  expect(container.textContent).not.toContain('Вписывание');
});
