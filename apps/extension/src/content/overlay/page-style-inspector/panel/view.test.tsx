// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PAGE_STYLE_INSPECTOR_TABS } from '@sniptale/runtime-contracts/page-style';
import type { PageStyleInspectorActions, PageStyleInspectorViewState } from '../types';
import { PageStyleInspectorPanel } from './view';

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

function createState(
  overrides: Partial<PageStyleInspectorViewState> = {}
): PageStyleInspectorViewState {
  const element = document.createElement('img');

  return {
    activeTab: PAGE_STYLE_INSPECTOR_TABS.PROPERTIES,
    defaultValues: {
      color: 'rgb(1, 2, 3)',
      'margin-bottom': '3px',
      'margin-left': '4px',
      'margin-right': '2px',
      'margin-top': '1px',
      width: '100px',
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
      domPath: 'img#image',
      element,
      kind: 'image',
      patch: { assets: [], declarations: [] },
      selector: { locator: '#image' },
      selectorLabel: 'img#image',
      tagName: 'img',
      textPreview: '',
    },
    templateQuery: '',
    templateName: 'Template',
    templates: [],
    values: {
      color: 'rgb(1, 2, 3)',
      'margin-top': '1px',
      'margin-right': '2px',
      'margin-bottom': '3px',
      'margin-left': '4px',
      width: '100px',
    },
    ...overrides,
  };
}

function renderPanel(state: PageStyleInspectorViewState, actions = createActions()) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);

  act(() => {
    root?.render(<PageStyleInspectorPanel actions={actions} open state={state} />);
  });

  return { actions };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('innerWidth', 1280);
  vi.stubGlobal('innerHeight', 900);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('opts into pointer events inside the content shadow host and keeps controls clickable', () => {
  const { actions } = renderPanel(createState());

  const panel = document.querySelector<HTMLElement>(
    '[data-ui="content.page-style-inspector.panel"]'
  );
  expect(panel?.className).toContain('pointer-events-auto');

  const rulesTab = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.textContent === 'Правила'
  );
  act(() => {
    rulesTab?.click();
  });

  const closeButton = document.querySelector<HTMLButtonElement>('button[aria-label="Закрыть"]');
  act(() => {
    closeButton?.click();
  });

  expect(actions.setActiveTab).toHaveBeenCalledWith(PAGE_STYLE_INSPECTOR_TABS.RULES);
  expect(actions.close).toHaveBeenCalledTimes(1);
});

it('renders the empty state as read-only without invoking save actions', () => {
  const { actions } = renderPanel(createState({ selection: null, values: {} }));

  const saveTemplate = document.querySelector<HTMLButtonElement>('button');
  const disabledButtons = Array.from(document.querySelectorAll('button:disabled'));

  expect(document.body.textContent).toContain('Блок не выбран');
  expect(disabledButtons.length).toBeGreaterThan(0);

  act(() => {
    saveTemplate?.click();
  });

  expect(actions.saveTemplate).not.toHaveBeenCalled();
  expect(actions.saveRule).not.toHaveBeenCalled();
});

it('shows localized image controls for selected image blocks', () => {
  renderPanel(createState());

  expect(document.body.textContent).toContain('Изображение');
  expect(document.body.textContent).toContain('Заменить файл');
  expect(document.body.textContent).toContain('Вписывание');
});

it('hides image-only controls when the selected block is not an image', () => {
  const element = document.createElement('p');

  renderPanel(
    createState({
      selection: {
        domPath: 'p#copy',
        element,
        kind: 'text',
        patch: { assets: [], declarations: [] },
        selector: { locator: '#copy' },
        selectorLabel: 'p#copy',
        tagName: 'p',
        textPreview: 'Copy',
      },
    })
  );

  expect(document.body.textContent).not.toContain('Заменить файл');
  expect(document.body.textContent).not.toContain('Вписывание');
});

it('resets an active alignment when the active option is pressed again', () => {
  const element = document.createElement('p');
  const { actions } = renderPanel(
    createState({
      defaultValues: { 'text-align': 'start' },
      selection: {
        domPath: 'p#copy',
        element,
        kind: 'text',
        patch: { assets: [], declarations: [] },
        selector: { locator: '#copy' },
        selectorLabel: 'p#copy',
        tagName: 'p',
        textPreview: 'Copy',
      },
      values: { 'text-align': 'center' },
    })
  );

  const centerButton = document.querySelector<HTMLButtonElement>('button[aria-label="По центру"]');
  act(() => {
    centerButton?.click();
  });

  expect(actions.updateValue).toHaveBeenCalledWith('text-align', 'start');
});

it('keeps template and rule fields collapsed until the save action is requested', () => {
  renderPanel(createState());

  expect(document.body.textContent).toContain('Сохранить как шаблон');
  expect(document.body.textContent).toContain('Сохранить как правило');
  expect(document.querySelector('input[placeholder="Название шаблона"]')).toBeNull();

  const templateButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.textContent === 'Сохранить как шаблон'
  );
  act(() => {
    templateButton?.click();
  });

  expect(document.querySelector('input[placeholder="Название шаблона"]')).not.toBeNull();
});

it('does not bubble panel wheel events to the host page', () => {
  renderPanel(createState());
  const pageWheel = vi.fn();
  document.addEventListener('wheel', pageWheel);
  const panel = document.querySelector<HTMLElement>(
    '[data-ui="content.page-style-inspector.panel"]'
  );

  act(() => {
    panel?.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
  });

  expect(pageWheel).not.toHaveBeenCalled();
  document.removeEventListener('wheel', pageWheel);
});

it('switches side controls from linked to per-side editing', () => {
  renderPanel(createState());

  const unlinkButton = document.querySelector<HTMLButtonElement>(
    'button[title="Развязать стороны"]'
  );
  act(() => {
    unlinkButton?.click();
  });

  expect(document.body.textContent).toContain('Верх');
  expect(document.body.textContent).toContain('Право');
});

it('turns off computed bold text with the compact font-weight toggle', () => {
  const element = document.createElement('p');
  const { actions } = renderPanel(
    createState({
      selection: {
        domPath: 'p#copy',
        element,
        kind: 'text',
        patch: { assets: [], declarations: [] },
        selector: { locator: '#copy' },
        selectorLabel: 'p#copy',
        tagName: 'p',
        textPreview: 'Copy',
      },
      values: { 'font-weight': '700' },
    })
  );

  const boldButton = document.querySelector<HTMLButtonElement>('button[aria-label="Насыщенность"]');
  act(() => {
    boldButton?.click();
  });

  expect(actions.updateValue).toHaveBeenCalledWith('font-weight', '400');
});
