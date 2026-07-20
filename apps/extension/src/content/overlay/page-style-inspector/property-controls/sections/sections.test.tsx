// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { PAGE_STYLE_INSPECTOR_TABS } from '@sniptale/runtime-contracts/page-style';
import type { PageStyleInspectorActions, PageStyleInspectorViewState } from '../../types';
import { AppearanceSection } from './appearance';
import { BoxSection } from './frame';
import { TextSection } from './text';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

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
    setRuleQuery: vi.fn(),
    setRetainImage: vi.fn(),
    setRetainText: vi.fn(),
    setTemplateQuery: vi.fn(),
    setRuleName: vi.fn(),
    setTemplateName: vi.fn(),
    toggleRuleEnabled: vi.fn(),
    updateAssetPatch: vi.fn(),
    updateValue: vi.fn(),
    updateValues: vi.fn(),
  };
}

function createState(): PageStyleInspectorViewState {
  const element = document.createElement('article');

  return {
    activeTab: PAGE_STYLE_INSPECTOR_TABS.PROPERTIES,
    defaultValues: {
      color: '#27272a',
      height: 'auto',
      'margin-top': '8px',
      'padding-top': '8px',
      width: 'auto',
    },
    draftPatch: { assets: [], declarations: [] },
    includeComputedInTemplate: false,
    modifiedProperties: [],
    retainImage: false,
    retainText: false,
    ruleName: 'Rule',
    ruleQuery: '',
    rules: [],
    selection: {
      domPath: 'article#target',
      element,
      kind: 'block',
      patch: { assets: [], declarations: [] },
      selector: { locator: '#target' },
      selectorLabel: 'article#target',
      tagName: 'article',
      textPreview: 'Copy',
    },
    templateQuery: '',
    templateName: 'Template',
    templates: [],
    values: {
      color: '#27272a',
      height: 'auto',
      'margin-top': '8px',
      'padding-top': '8px',
      width: 'auto',
    },
  };
}

function renderNode(node: React.ReactNode) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);

  act(() => {
    root?.render(node);
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

it('renders text, frame, and appearance sections as canonical block groups', () => {
  const props = { actions: createActions(), disabled: false, state: createState() };

  renderNode(
    <>
      <TextSection {...props} />
      <BoxSection {...props} />
      <AppearanceSection {...props} />
    </>
  );

  expect(document.body.textContent).toContain('Текст');
  expect(document.body.textContent).toContain('Кадр');
  expect(document.body.textContent).toContain('Оформление');
  expect(document.body.textContent).toContain('Заливка');
  expect(document.body.textContent).toContain('Рамка');
});
