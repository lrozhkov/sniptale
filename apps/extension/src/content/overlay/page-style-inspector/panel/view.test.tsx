// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { PageStyleInspectorActions, PageStyleInspectorViewState } from '../types';

vi.mock('../property-controls/view', () => ({
  PageStylePropertyControls: () => <div data-ui="direct-property-controls" />,
}));

import { PageStyleInspectorPanel } from './view';

const actions: PageStyleInspectorActions = {
  close: vi.fn(),
  comment: {
    commit: vi.fn(() => true),
    endComposition: vi.fn(),
    startComposition: vi.fn(),
    updateDraft: vi.fn(),
  },
  resetValue: vi.fn(),
  setSideFieldLinked: vi.fn(),
  updateValue: vi.fn(),
  updateValues: vi.fn(),
};

const state: PageStyleInspectorViewState = {
  comment: { commitFailed: false, draft: '', marker: null },
  defaultValues: {},
  draftPatch: { declarations: [] },
  modifiedProperties: [],
  selection: null,
  values: {},
};

it('renders only the direct property surface when open', () => {
  const markup = renderToStaticMarkup(
    <PageStyleInspectorPanel actions={actions} open={true} state={state} />
  );

  expect(markup).toContain('content.page-style-inspector.panel');
  expect(markup).toContain('direct-property-controls');
  expect(markup).not.toContain('role="tab"');
  expect(markup).not.toContain('input type="file"');
});

it('does not render the surface when closed', () => {
  expect(
    renderToStaticMarkup(<PageStyleInspectorPanel actions={actions} open={false} state={state} />)
  ).toBe('');
});
