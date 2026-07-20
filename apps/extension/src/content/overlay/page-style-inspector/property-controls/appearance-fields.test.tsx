// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  PAGE_STYLE_ASSET_KINDS,
  PAGE_STYLE_INSPECTOR_TABS,
} from '@sniptale/runtime-contracts/page-style';
import type { PageStyleInspectorActions, PageStyleInspectorViewState } from '../types';
import { AppearanceSection } from './sections/appearance';

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
  const values = {
    'background-color': '#ffffff',
    'background-image': 'linear-gradient(90deg, #ffffff 0%, #000000 100%)',
    'box-shadow': '0px 8px 18px 0px rgba(0, 0, 0, 0.2)',
  };

  return {
    activeTab: PAGE_STYLE_INSPECTOR_TABS.PROPERTIES,
    defaultValues: values,
    draftPatch: {
      assets: [
        {
          assetId: 'asset-bg',
          filename: 'background.png',
          kind: PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE,
          mimeType: 'image/png',
          size: 42_000,
        },
      ],
      declarations: [],
    },
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

function renderAppearance() {
  const actions = createActions();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);

  act(() => {
    root?.render(<AppearanceSection actions={actions} disabled={false} state={createState()} />);
  });

  return actions;
}

function changeInput(label: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!input) {
    throw new Error(`Expected input: ${label}`);
  }
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
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

it('renders gradient and shadow as structured controls instead of raw CSS text fields', () => {
  renderAppearance();

  expect(document.querySelector('input[aria-label="Градиент"]')).toBeNull();
  expect(document.querySelector('input[aria-label="Тень"]')).toBeNull();
  expect(
    document.querySelector('[data-ui="content.page-style-inspector.gradient-field"]')
  ).not.toBeNull();
  expect(
    document.querySelector('[data-ui="content.page-style-inspector.shadow-field"]')
  ).not.toBeNull();
});

it('commits gradient and shadow subcontrol edits as CSS declarations', () => {
  const actions = renderAppearance();

  changeInput('Угол градиента', '135');
  expect(actions.updateValue).toHaveBeenCalledWith(
    'background-image',
    'linear-gradient(135deg, #ffffff 0%, #000000 100%)'
  );

  changeInput('Смещение X', '4');
  expect(actions.updateValue).toHaveBeenCalledWith(
    'box-shadow',
    '4px 8px 18px 0px rgba(0, 0, 0, 0.2)'
  );
});

it('shows selected background file metadata and exposes clear action', () => {
  const actions = renderAppearance();

  expect(document.body.textContent).toContain('background.png');
  expect(document.body.textContent).toContain('41 KB');
  const clearButton = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Удалить файл фона"]'
  );

  act(() => {
    clearButton?.click();
  });

  expect(actions.clearBackgroundAsset).toHaveBeenCalledTimes(1);
});
