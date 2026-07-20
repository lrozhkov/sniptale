// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { PAGE_STYLE_INSPECTOR_TABS } from '@sniptale/runtime-contracts/page-style';
import { PageStylePropertyControls } from './view';
import type { PageStyleInspectorActions, PageStyleInspectorViewState } from '../types';

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

function createState(kind: 'image' | 'text'): PageStyleInspectorViewState {
  const element = kind === 'image' ? document.createElement('img') : document.createElement('p');

  return {
    activeTab: PAGE_STYLE_INSPECTOR_TABS.PROPERTIES,
    defaultValues: {
      height: 'auto',
      width: 'auto',
      'object-fit': 'cover',
      'object-position': '50% 50%',
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
      domPath: `${kind}#target`,
      element,
      kind,
      patch: { assets: [], declarations: [] },
      selector: { locator: '#target' },
      selectorLabel: `${kind}#target`,
      tagName: kind === 'image' ? 'img' : 'p',
      textPreview: kind === 'text' ? 'Copy' : '',
    },
    templateQuery: '',
    templateName: 'Template',
    templates: [],
    values: {
      height: 'auto',
      width: 'auto',
      'object-fit': 'cover',
      'object-position': '50% 50%',
    },
  };
}

function renderControls(state: PageStyleInspectorViewState, actions = createActions()) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);

  act(() => {
    root?.render(<PageStylePropertyControls actions={actions} disabled={false} state={state} />);
  });

  return actions;
}

function inputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
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

it('keeps image editing focused on image, frame, and appearance controls', () => {
  renderControls(createState('image'));

  expect(document.body.textContent).toContain('Изображение');
  expect(document.body.textContent).toContain('Кадр');
  expect(document.body.textContent).toContain('Оформление');
  expect(document.body.textContent).not.toContain('Начертание');
});

it('keeps text editing focused on text, frame, and appearance controls', () => {
  renderControls(createState('text'));

  expect(document.body.textContent).toContain('Текст');
  expect(document.body.textContent).toContain('Кадр');
  expect(document.body.textContent).toContain('Оформление');
  expect(document.body.textContent).not.toContain('Вписывание');
});

it('does not present unsafe background url editing as a normal block parameter', () => {
  renderControls(createState('text'));

  expect(document.body.textContent).toContain('Градиент');
  expect(document.body.textContent).not.toContain('URL');
});

it('converts numeric edits from auto-sized frame fields into valid CSS lengths', () => {
  const actions = renderControls(createState('text'));
  const widthInput = Array.from(document.querySelectorAll<HTMLInputElement>('input')).find(
    (input) => input.value === 'auto'
  );

  act(() => {
    if (!widthInput) {
      throw new Error('Expected width input');
    }
    inputValue(widthInput, '620');
  });

  expect(actions.updateValue).toHaveBeenCalledWith('width', '620px');
});
