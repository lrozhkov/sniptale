// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  PAGE_STYLE_INSPECTOR_TABS,
  PAGE_STYLE_SCOPE_TYPES,
} from '@sniptale/runtime-contracts/page-style';
import type { PageStyleInspectorActions, PageStyleInspectorViewState } from '../types';
import { RulesTab } from './tabs';

let host: HTMLDivElement | null = null;
let root: Root | null = null;

function createState(): PageStyleInspectorViewState {
  return {
    activeTab: PAGE_STYLE_INSPECTOR_TABS.RULES,
    defaultValues: {},
    draftPatch: { assets: [], declarations: [] },
    includeComputedInTemplate: false,
    modifiedProperties: [],
    registryError: null,
    registryLoading: false,
    retainImage: false,
    retainText: false,
    ruleName: 'Rule',
    ruleQuery: '',
    rules: [
      {
        createdAt: 1,
        enabled: true,
        id: 'rule-1',
        name: 'Rule',
        patch: { assets: [], declarations: [] },
        propertySummary: [],
        scope: {
          active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
          exactAddress: 'https://example.com/page',
        },
        selector: { locator: '#target' },
        updatedAt: 1,
      },
    ],
    selection: null,
    templateQuery: '',
    templateName: 'Template',
    templates: [],
    values: {},
  };
}

function createActions(): PageStyleInspectorActions {
  return {
    applyRule: vi.fn(),
    applyTemplate: vi.fn(),
    clearBackgroundAsset: vi.fn(),
    close: vi.fn(),
    deleteRule: vi.fn(async () => ({
      message: 'Действие выполнено, но часть файлов не удалось очистить',
      state: 'warning' as const,
    })),
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

function renderRulesTab(actions = createActions()) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);

  act(() => {
    root?.render(<RulesTab actions={actions} state={createState()} />);
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

it('shows a warning when restore rule deletion cannot clean assets', async () => {
  const actions = renderRulesTab();

  await act(async () => {
    document.querySelector<HTMLButtonElement>('button[aria-label="Удалить правило"]')?.click();
  });

  expect(actions.deleteRule).toHaveBeenCalledTimes(1);
  expect(document.body.textContent).toContain(
    'Действие выполнено, но часть файлов не удалось очистить'
  );
});
