// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { PAGE_STYLE_INSPECTOR_TABS } from '@sniptale/runtime-contracts/page-style';
import type { PageStyleInspectorActions, PageStyleInspectorViewState } from '../types';
import { SavePanel } from './panel';

let host: HTMLDivElement | null = null;
let root: Root | null = null;

function createState(): PageStyleInspectorViewState {
  return {
    activeTab: PAGE_STYLE_INSPECTOR_TABS.PROPERTIES,
    defaultValues: {},
    draftPatch: { assets: [], declarations: [] },
    includeComputedInTemplate: false,
    modifiedProperties: ['color'],
    retainImage: false,
    retainText: false,
    ruleName: 'Rule',
    ruleQuery: '',
    rules: [],
    selection: null,
    templateQuery: '',
    templateName: 'Template',
    templates: [],
    values: {},
  };
}

function createActions(saveTemplate = vi.fn(async () => undefined)): PageStyleInspectorActions {
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
    saveTemplate,
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

function renderSavePanel(actions = createActions()) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);

  act(() => {
    root?.render(<SavePanel actions={actions} disabled={false} state={createState()} />);
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
  vi.clearAllMocks();
});

async function openTemplateSaveCard() {
  await act(async () => {
    document.querySelector<HTMLButtonElement>('button')?.click();
  });
}

function findButtonByText(text: string): HTMLButtonElement {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent === text
  );
  if (!button) {
    throw new Error(`Expected button: ${text}`);
  }
  return button;
}

it('surfaces template creation success from the save card', async () => {
  const actions = renderSavePanel();
  await openTemplateSaveCard();

  await act(async () => {
    findButtonByText('Сохранить').click();
  });

  expect(actions.saveTemplate).toHaveBeenCalledTimes(1);
  expect(document.body.textContent).toContain('Шаблон сохранен');
});

it('surfaces template creation failures from the save card', async () => {
  const actions = createActions(
    vi.fn(async () => {
      throw new Error('save failed');
    })
  );
  renderSavePanel(actions);
  await openTemplateSaveCard();

  await act(async () => {
    findButtonByText('Сохранить').click();
  });

  expect(actions.saveTemplate).toHaveBeenCalledTimes(1);
  expect(document.body.textContent).toContain('Не удалось сохранить шаблон');
});
