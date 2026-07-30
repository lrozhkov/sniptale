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

it('keeps compact localized section navigation and renders only the active settings group', () => {
  act(() => root.render(<DesignReviewSettings actions={actions} disabled={false} state={state} />));

  expect(container.textContent).toContain('Цвет');
  expect(container.textContent).not.toContain('Ширина');

  const layoutButton = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Размер и отступы"]'
  );
  act(() => layoutButton?.click());

  expect(container.textContent).toContain('Ширина');
  expect(container.textContent).toContain('Высота');
  expect(container.textContent).not.toContain('Цвет');
  expect(container.querySelector('input[type="file"]')).toBeNull();
});
