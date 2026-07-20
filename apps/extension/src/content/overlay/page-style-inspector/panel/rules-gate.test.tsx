// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PAGE_STYLE_INSPECTOR_TABS } from '@sniptale/runtime-contracts/page-style';
import type { PageStyleInspectorActions, PageStyleInspectorViewState } from '../types';
import { PageStyleInspectorPanel } from './view';

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
    updateTemplate: vi.fn(),
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
    updateValue: vi.fn(),
    updateValues: vi.fn(),
  };
}

function createState(): PageStyleInspectorViewState {
  return {
    activeTab: PAGE_STYLE_INSPECTOR_TABS.RULES,
    defaultValues: { color: 'rgb(1, 2, 3)' },
    draftPatch: { assets: [], declarations: [] },
    includeComputedInTemplate: false,
    modifiedProperties: [],
    retainImage: false,
    retainText: false,
    ruleName: 'Rule',
    ruleQuery: '',
    rules: [],
    selection: null,
    templateName: 'Template',
    templateQuery: '',
    templates: [],
    values: { color: 'rgb(1, 2, 3)' },
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('innerWidth', 1280);
  vi.stubGlobal('innerHeight', 900);
  Object.defineProperty(globalThis, '__ENABLE_PAGE_STYLE_RULES__', {
    configurable: true,
    value: false,
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
  document.body.replaceChildren();
  Reflect.deleteProperty(globalThis, '__ENABLE_PAGE_STYLE_RULES__');
  vi.unstubAllGlobals();
});

it('hides rules tab and save-as-rule controls when rules UI is release-gated', () => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);

  act(() => {
    root?.render(<PageStyleInspectorPanel actions={createActions()} open state={createState()} />);
  });

  expect(document.body.textContent).not.toContain('Правила');
  expect(document.body.textContent).not.toContain('Сохранить как правило');
  expect(document.body.textContent).toContain('Сохранить как шаблон');
});
