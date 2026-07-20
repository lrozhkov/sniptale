// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  PAGE_STYLE_ALLOWED_PROPERTIES,
  PAGE_STYLE_INSPECTOR_TABS,
} from '@sniptale/runtime-contracts/page-style';
import { PageStylePropertyControls } from './view';
import {
  APPEARANCE_FIELD_PROPERTIES,
  FRAME_FIELD_PROPERTIES,
  IMAGE_FIELD_PROPERTIES,
  TEXT_FIELD_PROPERTIES,
  clickButton,
  inputLinkedSideValue,
  inputValue,
  linkSideField,
  pickColor,
  pickLinkedSideOption,
  pickOption,
} from './field-matrix.test-support';
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
  const values = {
    color: '#27272a',
    'font-family': 'Manrope',
    'font-size': '15px',
    'font-style': 'normal',
    'font-weight': '400',
    'background-image': 'linear-gradient(90deg, #ffffff 0%, #000000 100%)',
    'box-shadow': '0px 8px 18px 0px rgba(0, 0, 0, 0.2)',
    height: 'auto',
    'letter-spacing': '0px',
    'line-height': '1.4',
    'margin-bottom': '8px',
    'margin-left': '8px',
    'margin-right': '8px',
    'margin-top': '8px',
    'object-fit': 'cover',
    'object-position': '50% 50%',
    'padding-bottom': '10px',
    'padding-left': '10px',
    'padding-right': '10px',
    'padding-top': '10px',
    'text-align': 'left',
    'text-decoration': 'none',
    width: 'auto',
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
    selection: createSelection(kind),
    templateQuery: '',
    templateName: 'Template',
    templates: [],
    values,
  };
}

function createSelection(kind: 'image' | 'text'): PageStyleInspectorViewState['selection'] {
  return {
    domPath: `${kind}#target`,
    element: kind === 'image' ? document.createElement('img') : document.createElement('p'),
    kind,
    patch: { assets: [], declarations: [] },
    selector: { locator: '#target' },
    selectorLabel: `${kind}#target`,
    tagName: kind === 'image' ? 'img' : 'p',
    textPreview: kind === 'text' ? 'Copy' : '',
  };
}

function renderControls(kind: 'image' | 'text') {
  const actions = createActions();
  const state = createState(kind);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(<StatefulPropertyControls actions={actions} state={state} />);
  });
  return actions;
}

function StatefulPropertyControls(props: {
  actions: PageStyleInspectorActions;
  state: PageStyleInspectorViewState;
}) {
  const [sideFieldLinks, setSideFieldLinks] = useState<Record<string, boolean>>({});
  const actions = {
    ...props.actions,
    setSideFieldLinked: (fieldKey: string, linked: boolean) => {
      setSideFieldLinks((current) => ({ ...current, [fieldKey]: linked }));
    },
  };

  return (
    <PageStylePropertyControls
      actions={actions}
      disabled={false}
      state={{ ...props.state, sideFieldLinks }}
    />
  );
}

function expectGroupUpdate(
  actions: PageStyleInspectorActions,
  properties: readonly string[],
  value: string
) {
  expect(actions.updateValues).toHaveBeenCalledWith(
    properties.map((property) => ({ property, value }))
  );
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

it('routes every text field to its page-style property update', async () => {
  const actions = renderControls('text');

  await pickColor('Цвет', '#2563eb');
  await pickOption('Шрифт', 'Georgia, serif');
  inputValue('Размер', '22');
  await pickOption('Высота строки', '1.5');
  await pickOption('Межбуквенный', '1px');
  await clickButton('Насыщенность');
  await clickButton('Наклон');
  await clickButton('Подчеркнуть');
  await clickButton('По центру');

  expect(actions.updateValue).toHaveBeenCalledWith('color', '#2563eb');
  expect(actions.updateValue).toHaveBeenCalledWith('font-family', 'Georgia, serif');
  expect(actions.updateValue).toHaveBeenCalledWith('font-size', '22px');
  expect(actions.updateValue).toHaveBeenCalledWith('line-height', '1.5');
  expect(actions.updateValue).toHaveBeenCalledWith('letter-spacing', '1px');
  expect(actions.updateValue).toHaveBeenCalledWith('font-weight', 'bold');
  expect(actions.updateValue).toHaveBeenCalledWith('font-style', 'italic');
  expect(actions.updateValue).toHaveBeenCalledWith('text-decoration', 'underline');
  expect(actions.updateValue).toHaveBeenCalledWith('text-align', 'center');
});

it('routes every frame field to valid CSS length updates', async () => {
  const actions = renderControls('text');

  inputValue('Ширина', '620');
  inputValue('Высота', '360');
  await inputLinkedSideValue('Внешние', '12');
  await inputLinkedSideValue('Внутренние', '18');

  expect(actions.updateValue).toHaveBeenCalledWith('width', '620px');
  expect(actions.updateValue).toHaveBeenCalledWith('height', '360px');
  expectGroupUpdate(
    actions,
    ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
    '12px'
  );
  expectGroupUpdate(
    actions,
    ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
    '18px'
  );
});

it('routes every appearance field to background and border updates', async () => {
  const actions = renderControls('text');

  await pickColor('Цвет фона', '#f97316');
  inputValue('Угол градиента', '135');
  inputValue('Смещение X', '4');
  await inputLinkedSideValue('Толщина', '4');
  await pickLinkedSideOption('Стиль', 'Пунктир');
  await linkSideField('Цвет рамки');
  await pickColor('Цвет рамки', '#2563eb');
  await inputLinkedSideValue('Скругление', '24');

  expect(actions.updateValue).toHaveBeenCalledWith('background-color', '#f97316');
  expect(actions.updateValue).toHaveBeenCalledWith(
    'background-image',
    'linear-gradient(135deg, #ffffff 0%, #000000 100%)'
  );
  expect(actions.updateValue).toHaveBeenCalledWith(
    'box-shadow',
    '4px 8px 18px 0px rgba(0, 0, 0, 0.2)'
  );
  expectGroupUpdate(
    actions,
    ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'],
    '4px'
  );
  expectGroupUpdate(
    actions,
    ['border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style'],
    'dashed'
  );
  expectGroupUpdate(
    actions,
    ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'],
    '#2563eb'
  );
  expectGroupUpdate(
    actions,
    [
      'border-top-left-radius',
      'border-top-right-radius',
      'border-bottom-right-radius',
      'border-bottom-left-radius',
    ],
    '24px'
  );
});

it('routes every image field to image and frame updates', async () => {
  const actions = renderControls('image');

  await pickOption('Вписывание', 'Вместить');
  inputValue('Позиция', '20% 35%');
  inputValue('Ширина', '260');
  inputValue('Высота', '160');

  expect(actions.updateValue).toHaveBeenCalledWith('object-fit', 'contain');
  expect(actions.updateValue).toHaveBeenCalledWith('object-position', '20% 35%');
  expect(actions.updateValue).toHaveBeenCalledWith('width', '260px');
  expect(actions.updateValue).toHaveBeenCalledWith('height', '160px');
});

it('keeps the UI field matrix aligned with every allowed page-style property', () => {
  const coveredProperties = [
    ...TEXT_FIELD_PROPERTIES,
    ...FRAME_FIELD_PROPERTIES,
    ...APPEARANCE_FIELD_PROPERTIES,
    ...IMAGE_FIELD_PROPERTIES,
  ].sort();

  expect(coveredProperties).toEqual([...PAGE_STYLE_ALLOWED_PROPERTIES].sort());
});
