// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { PAGE_STYLE_INSPECTOR_TABS } from '@sniptale/runtime-contracts/page-style';
import type { PageStyleInspectorActions, PageStyleInspectorViewState } from '../types';
import { TextSection } from './sections/text';

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

function createState(overrides: Partial<PageStyleInspectorViewState['values']> = {}) {
  const values = {
    color: '#27272a',
    'font-family': 'Manrope',
    'font-size': '15px',
    'font-style': 'normal',
    'font-weight': '400',
    'letter-spacing': '0.25px',
    'line-height': '1.4',
    'text-align': 'left',
    'text-decoration': 'none',
    ...overrides,
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
    selection: {
      domPath: 'p#target',
      element: document.createElement('p'),
      kind: 'text',
      patch: { assets: [], declarations: [] },
      selector: { locator: '#target' },
      selectorLabel: 'p#target',
      tagName: 'p',
      textPreview: 'Copy',
    },
    templateQuery: '',
    templateName: 'Template',
    templates: [],
    values,
  } satisfies PageStyleInspectorViewState;
}

function renderSection(state = createState()) {
  const actions = createActions();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);

  act(() => {
    root?.render(<TextSection actions={actions} disabled={false} state={state} />);
  });

  return actions;
}

async function pickOption(label: string, title: string) {
  const trigger = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!trigger) {
    throw new Error(`Expected select trigger: ${label}`);
  }
  await act(async () => {
    trigger.click();
  });
  const option = document.querySelector<HTMLButtonElement>(
    `button[role="option"][title="${title}"]`
  );
  if (!option) {
    throw new Error(`Expected option: ${title}`);
  }
  await act(async () => {
    option.click();
  });
}

async function clickButton(label: string) {
  const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) {
    throw new Error(`Expected button: ${label}`);
  }
  await act(async () => {
    button.click();
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

it('renders font, line-height, and letter-spacing as selectable controls', async () => {
  const actions = renderSection();

  expect(document.querySelector('input[aria-label="Шрифт"]')).toBeNull();
  expect(document.querySelector('input[aria-label="Высота строки"]')).toBeNull();
  expect(document.querySelector('input[aria-label="Межбуквенный"]')).toBeNull();

  await pickOption('Шрифт', 'Arial, sans-serif');
  await pickOption('Высота строки', '1.5');
  await pickOption('Межбуквенный', '0.5px');

  expect(actions.updateValue).toHaveBeenCalledWith('font-family', 'Arial, sans-serif');
  expect(actions.updateValue).toHaveBeenCalledWith('line-height', '1.5');
  expect(actions.updateValue).toHaveBeenCalledWith('letter-spacing', '0.5px');
});

it('keeps custom computed text values selectable instead of showing blank labels', () => {
  renderSection(
    createState({
      'font-family': 'Custom Display',
      'letter-spacing': '0.25px',
      'line-height': '1.37',
    })
  );

  expect(
    document.querySelector<HTMLButtonElement>('button[aria-label="Шрифт"]')?.textContent
  ).toContain('Custom Display');
  expect(
    document.querySelector<HTMLButtonElement>('button[aria-label="Высота строки"]')?.textContent
  ).toContain('1.37');
  expect(
    document.querySelector<HTMLButtonElement>('button[aria-label="Межбуквенный"]')?.textContent
  ).toContain('0.25px');
});

it('toggles underline and line-through independently on one text-decoration value', async () => {
  const actions = renderSection();

  await clickButton('Подчеркнуть');
  expect(actions.updateValue).toHaveBeenLastCalledWith('text-decoration', 'underline');

  act(() => {
    root?.render(
      <TextSection
        actions={actions}
        disabled={false}
        state={createState({ 'text-decoration': 'underline' })}
      />
    );
  });
  await clickButton('Зачеркнуть');
  expect(actions.updateValue).toHaveBeenLastCalledWith('text-decoration', 'underline line-through');

  act(() => {
    root?.render(
      <TextSection
        actions={actions}
        disabled={false}
        state={createState({ 'text-decoration': 'underline line-through' })}
      />
    );
  });
  await clickButton('Подчеркнуть');
  expect(actions.updateValue).toHaveBeenLastCalledWith('text-decoration', 'line-through');
});
