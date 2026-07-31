// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { DesignReviewActions, DesignReviewViewState } from '../../types';
import { BorderSection } from './border';

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

const borderValues = {
  'border-top-width': '1px',
  'border-right-width': '1px',
  'border-bottom-width': '1px',
  'border-left-width': '1px',
  'border-top-style': 'solid',
  'border-right-style': 'solid',
  'border-bottom-style': 'solid',
  'border-left-style': 'solid',
  'border-top-color': '#000000',
  'border-right-color': '#000000',
  'border-bottom-color': '#000000',
  'border-left-color': '#000000',
  'border-top-left-radius': '4px',
  'border-top-right-radius': '4px',
  'border-bottom-right-radius': '4px',
  'border-bottom-left-radius': '4px',
} as const;

const state: DesignReviewViewState = {
  action: 'refine',
  anchor: null,
  comment: { commitFailed: false, draft: '', marker: null },
  defaultValues: borderValues,
  draftPatch: { declarations: [] },
  modifiedProperties: [],
  selection: null,
  settingsOpen: true,
  values: borderValues,
};

it('owns four compact common border groups without nested disclosures', () => {
  const root = document.createElement('div');
  root.innerHTML = renderToStaticMarkup(
    <BorderSection actions={actions} disabled={false} state={state} />
  );

  expect(root.querySelectorAll('[data-ui="content.design-review.side-field"]')).toHaveLength(4);
  expect(root.querySelector('[data-ui="content.design-review.side-values"]')).toBeNull();
  expect(root.textContent).toContain('Толщина');
  expect(root.textContent).toContain('Цвет рамки');
  expect(root.textContent).toContain('Скругление');
  expect(root.querySelector('details')).toBeNull();
});
