// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { PageStyleInspectorActions, PageStyleInspectorViewState } from '../types';
import { PAGE_STYLE_INSPECTOR_TABS } from '@sniptale/runtime-contracts/page-style';
import { LinkedSideFields, SIDE_ORDER, createBorderSideProperty } from './side-fields';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function createState(value: string): PageStyleInspectorViewState {
  const values = Object.fromEntries(
    SIDE_ORDER.map((side) => [createBorderSideProperty(side, 'style'), value])
  ) as PageStyleInspectorViewState['values'];

  return {
    activeTab: PAGE_STYLE_INSPECTOR_TABS.PROPERTIES,
    defaultValues: values,
    draftPatch: { assets: [], declarations: [] },
    includeComputedInTemplate: false,
    modifiedProperties: [],
    retainImage: false,
    retainText: false,
    ruleName: 'Rule',
    ruleQuery: '',
    rules: [],
    selection: null,
    templateQuery: '',
    templateName: 'Template',
    templates: [],
    values,
  };
}

function renderBorderStyle(value: string) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <LinkedSideFields
        disabled={false}
        label="Стиль"
        properties={SIDE_ORDER.map((side) => createBorderSideProperty(side, 'style'))}
        state={createState(value)}
        onChange={vi.fn<PageStyleInspectorActions['updateValue']>()}
        onChangeMany={vi.fn<PageStyleInspectorActions['updateValues']>()}
      />
    );
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
  document.body.replaceChildren();
});

it('shows none for empty border style values instead of a blank select', () => {
  renderBorderStyle('');

  const firstSelect = document.querySelector<HTMLButtonElement>('button[aria-label="Верх"]');
  expect(firstSelect?.textContent).toContain('Нет');
});

it('shows unsupported border style values instead of an empty label', () => {
  renderBorderStyle('groove');

  const firstSelect = document.querySelector<HTMLButtonElement>('button[aria-label="Верх"]');
  expect(firstSelect?.textContent).toContain('groove');
});
