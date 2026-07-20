// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { PAGE_STYLE_INSPECTOR_TABS } from '@sniptale/runtime-contracts/page-style';
import { translate } from '../../../../platform/i18n';
import type { PageStyleSelectionSnapshot } from '../runtime/properties';
import type { PageStyleInspectorActions, PageStyleInspectorViewState } from '../types';
import { TemplatesTab } from './tab';

let host: HTMLDivElement | null = null;
let root: Root | null = null;

function createActions(): PageStyleInspectorActions {
  return {
    applyRule: vi.fn(),
    applyTemplate: vi.fn(),
    clearBackgroundAsset: vi.fn(),
    close: vi.fn(),
    deleteRule: vi.fn(),
    deleteTemplate: vi.fn(),
    duplicateTemplate: vi.fn(),
    renameTemplate: vi.fn(),
    resetValue: vi.fn(),
    saveBackgroundAsset: vi.fn(),
    saveImageReplacement: vi.fn(),
    saveRule: vi.fn(),
    saveTemplate: vi.fn(),
    setActiveTab: vi.fn(),
    setIncludeComputedInTemplate: vi.fn(),
    setRetainImage: vi.fn(),
    setRetainText: vi.fn(),
    setRuleName: vi.fn(),
    setRuleQuery: vi.fn(),
    setTemplateName: vi.fn(),
    setTemplateQuery: vi.fn(),
    toggleRuleEnabled: vi.fn(),
    updateAssetPatch: vi.fn(),
    updateTemplate: vi.fn(),
    updateValue: vi.fn(),
    updateValues: vi.fn(),
  };
}

function createSelection(): PageStyleSelectionSnapshot {
  return {
    domPath: '#target',
    element: document.createElement('div'),
    kind: 'block',
    patch: { assets: [], declarations: [] },
    selector: { locator: '#target' },
    selectorLabel: '#target',
    tagName: 'div',
    textPreview: '',
  };
}

function createState(templateQuery = ''): PageStyleInspectorViewState {
  return {
    activeTab: PAGE_STYLE_INSPECTOR_TABS.TEMPLATES,
    defaultValues: {},
    draftPatch: { assets: [], declarations: [] },
    includeComputedInTemplate: false,
    modifiedProperties: [],
    retainImage: false,
    retainText: false,
    ruleName: 'Rule',
    ruleQuery: '',
    rules: [],
    selection: createSelection(),
    templateName: 'Template',
    templateQuery,
    templates: [
      {
        createdAt: 1,
        id: 'template-1',
        name: 'Hero',
        patch: { assets: [], declarations: [{ property: 'color', value: '#111111' }] },
        propertySummary: ['color'],
        updatedAt: 1,
      },
    ],
    values: {},
  };
}

function renderTab(state = createState()) {
  const actions = createActions();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);

  act(() => {
    root?.render(<TemplatesTab actions={actions} state={state} />);
  });

  return actions;
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

it('shows a filtered empty state when no template matches the search query', () => {
  renderTab(createState('missing'));

  expect(document.body.textContent).toContain('Подходящих шаблонов нет');
});

it('updates the template search query through the compact input', () => {
  const actions = renderTab();
  const input = document.querySelector<HTMLInputElement>(
    `input[aria-label="${translate('content.pageStyleInspector.searchTemplates')}"]`
  );
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;

  act(() => {
    setter?.call(input, 'hero');
    input?.dispatchEvent(new Event('input', { bubbles: true }));
  });

  expect(actions.setTemplateQuery).toHaveBeenCalledWith('hero');
});
