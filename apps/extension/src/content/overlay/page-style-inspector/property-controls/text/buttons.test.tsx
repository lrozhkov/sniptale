// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { PAGE_STYLE_INSPECTOR_TABS } from '@sniptale/runtime-contracts/page-style';
import { translate } from '../../../../../platform/i18n';
import type { PageStyleInspectorActions, PageStyleInspectorViewState } from '../../types';
import { TextModeButtons } from './buttons';

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

function createState(textDecoration: string): PageStyleInspectorViewState {
  const values = {
    'font-style': 'normal',
    'font-weight': '400',
    'text-align': 'left',
    'text-decoration': textDecoration,
  };

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
    templateName: 'Template',
    templateQuery: '',
    templates: [],
    values,
  };
}

function renderButtons(actions: PageStyleInspectorActions, textDecoration = 'none') {
  act(() => {
    root?.render(
      <TextModeButtons actions={actions} disabled={false} state={createState(textDecoration)} />
    );
  });
}

async function clickToggle(label: string) {
  await act(async () => {
    document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)?.click();
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

it('does not make underline and line-through mutually exclusive', async () => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const actions = createActions();

  renderButtons(actions);
  await clickToggle(translate('content.pageStyleInspector.optionUnderline'));
  expect(actions.updateValue).toHaveBeenLastCalledWith('text-decoration', 'underline');

  renderButtons(actions, 'underline');
  await clickToggle(translate('content.pageStyleInspector.optionLineThrough'));
  expect(actions.updateValue).toHaveBeenLastCalledWith('text-decoration', 'underline line-through');
});
