// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DesignReviewActions, DesignReviewViewState } from '../types';
import { DesignReviewSettings } from './view';
import { NumericField } from './numeric-field';
import { CssTextField } from './text-fields';
import { translate } from '../../../../platform/i18n';

const actions: DesignReviewActions = {
  close: vi.fn(),
  comment: {
    commit: vi.fn(() => true),
    endComposition: vi.fn(),
    startComposition: vi.fn(),
    updateDraft: vi.fn(),
  },
  copyElement: vi.fn(async () => true),
  copyPath: vi.fn(async () => undefined),
  delete: vi.fn(),
  resetValue: vi.fn(),
  selectAction: vi.fn(),
  setSettingsOpen: vi.fn(),
  setSideFieldLinked: vi.fn(),
  updateValue: vi.fn(),
  updateValues: vi.fn(),
  voice: { start: vi.fn(), stop: vi.fn() },
};

const state: DesignReviewViewState = {
  action: 'refine',
  anchor: { x: 40, y: 40 },
  comment: { commitFailed: false, draft: '', marker: null },
  defaultValues: { color: 'rgb(0, 0, 0)', height: '40px', width: '120px' },
  draftPatch: { declarations: [] },
  modifiedProperties: [],
  selection: {
    domPath: 'html > body > main > h1:nth-of-type(1)',
    element: document.createElement('h1'),
    kind: 'text',
    patch: { declarations: [] },
    selectorLabel: 'h1:nth-of-type(1)',
    tagName: 'h1',
    textPreview: 'Heading',
  },
  settingsOpen: true,
  values: { color: 'rgb(0, 0, 0)', height: '40px', width: '120px' },
  voice: {
    active: false,
    audioLevel: 0,
    caretPosition: null,
    errorCode: null,
    phase: 'idle',
  },
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('uses compact non-collapsible navigation and renders only the active logical group', () => {
  act(() => root.render(<DesignReviewSettings actions={actions} disabled={false} state={state} />));

  const navigation = container.querySelector('nav');
  expect(navigation?.querySelectorAll('button')).toHaveLength(4);
  expect(navigation?.className).toContain('border-solid');
  expect(container.querySelector('details')).toBeNull();
  expect(container.querySelector('summary')).toBeNull();
  expect(container.textContent).toContain('Цвет');
  expect(container.textContent).not.toContain('Ширина');

  const layoutButton = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Размер и отступы"]'
  );
  act(() => layoutButton?.click());

  expect(container.textContent).toContain('Ширина');
  expect(container.textContent).toContain('Высота');
  expect(container.textContent).not.toContain('Цвет');
  expect(container.querySelectorAll('[data-ui="content.design-review.side-field"]')).toHaveLength(
    2
  );
  expect(container.querySelector('[data-ui="content.design-review.side-values"]')).toBeNull();
  expect(container.querySelector('[data-ui="content.design-review.field"]')?.className).toContain(
    '!grid-cols-1'
  );
  expect(container.querySelector('[data-ui="content.design-review.close-settings"]')).toBeNull();
  expect(container.querySelector('input[type="file"]')).toBeNull();
});

it('separates fill effects from borders so each section stays focused', () => {
  act(() => root.render(<DesignReviewSettings actions={actions} disabled={false} state={state} />));

  const appearanceButton = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Фон и эффекты"]'
  );
  act(() => appearanceButton?.click());
  expect(container.textContent).toContain('Цвет фона');
  expect(container.textContent).toContain('Тень');
  expect(container.textContent).not.toContain('Толщина');

  const borderButton = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Границы и скругление"]'
  );
  act(() => borderButton?.click());
  expect(container.textContent).toContain('Толщина');
  expect(container.textContent).toContain('Цвет рамки');
  expect(container.textContent).toContain('Скругление');
  expect(container.textContent).not.toContain('Цвет фона');
});

it('shows image layout properties without preview or asset-upload controls', () => {
  const imageState: DesignReviewViewState = {
    ...state,
    selection: {
      ...state.selection!,
      element: document.createElement('img'),
      kind: 'image',
      tagName: 'img',
    },
  };
  act(() =>
    root.render(<DesignReviewSettings actions={actions} disabled={false} state={imageState} />)
  );

  expect(container.querySelector('nav')?.querySelectorAll('button')).toHaveLength(5);
  expect(container.textContent).toContain('Вписывание');
  expect(container.textContent).toContain('Позиция');
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('input[type="file"]')).toBeNull();

  act(() => root.render(<DesignReviewSettings actions={actions} disabled={false} state={state} />));
  expect(container.textContent).toContain('Цвет');
  expect(container.textContent).not.toContain('Вписывание');
});

it.each([
  ['12', '12px'],
  ['auto', 'auto'],
  ['calc(100% - 2em)', 'calc(100% - 2em)'],
  ['2em', '2em'],
  ['50%', '50%'],
  ['', ''],
])('preserves numeric field input transition %s as %s', (draft, expected) => {
  const onChange = vi.fn();
  act(() =>
    root.render(
      <NumericField
        label="Width"
        value="8px"
        defaultValue="8px"
        disabled={false}
        onChange={onChange}
      />
    )
  );
  const input = container.querySelector<HTMLInputElement>('input')!;
  expect(input.value).toBe('8');
  const unit = container.querySelector(`[id="${input.getAttribute('aria-describedby')}"]`);
  expect(unit?.textContent).toBe('px');
  expect(unit?.getAttribute('aria-hidden')).toBeNull();
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, draft);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(onChange).toHaveBeenLastCalledWith(expected);
});

it('tracks keyboard and portaled pointer intent without changing the settings selection', () => {
  act(() => root.render(<DesignReviewSettings actions={actions} disabled={false} state={state} />));
  const panel = container.querySelector('[data-ui="content.design-review.settings"]')!;
  expect(panel.getAttribute('data-focus-modality')).toBe('pointer');
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })));
  expect(panel.getAttribute('data-focus-modality')).toBe('keyboard');
  act(() => document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  expect(panel.getAttribute('data-focus-modality')).toBe('pointer');
  expect(panel.querySelector('button[aria-pressed="true"]')?.getAttribute('aria-label')).toBe(
    'Текст'
  );
});

it('clears CSS text through its native callback and preserves empty fallback and focus', () => {
  const onChange = vi.fn();
  act(() =>
    root.render(
      <CssTextField
        disabled={false}
        label="Object position"
        value="10% 20%"
        defaultValue="normal"
        onChange={onChange}
      />
    )
  );
  const input = container.querySelector<HTMLInputElement>('input')!;
  const clear = container.querySelector<HTMLButtonElement>('.sniptale-field-clear')!;
  expect(clear).not.toBeNull();
  act(() => clear.click());
  expect(onChange).toHaveBeenCalledExactlyOnceWith('normal');
  expect(document.activeElement).toBe(input);
  act(() =>
    root.render(
      <CssTextField
        disabled={false}
        label="Object position"
        value="normal"
        defaultValue="normal"
        onChange={onChange}
      />
    )
  );
  expect(input.value).toBe('');
  expect(container.querySelector('.sniptale-field-clear')).toBeNull();
  act(() =>
    root.render(
      <CssTextField disabled label="Object position" value="10% 20%" onChange={onChange} />
    )
  );
  expect(input.disabled).toBe(true);
  expect(container.querySelector('.sniptale-field-clear')).toBeNull();
  expect(onChange).toHaveBeenCalledOnce();
});

it('preserves text-property toggles, accepted-value reset, and disabled admission through canonical rows', () => {
  const localActions = { ...actions, updateValue: vi.fn(), resetValue: vi.fn() };
  const defaults = {
    'font-weight': '400',
    'font-style': 'normal',
    'text-decoration': 'none',
    'text-align': 'left',
  };
  const render = (values: DesignReviewViewState['values'], disabled = false) =>
    act(() =>
      root.render(
        <DesignReviewSettings
          actions={localActions}
          disabled={disabled}
          state={{ ...state, defaultValues: defaults, values }}
        />
      )
    );
  const button = (label: string) => {
    const found = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (node) => node.getAttribute('aria-label') === label
    );
    expect(found).toBeDefined();
    return found!;
  };
  render(defaults);
  for (const [key, property, value] of [
    ['fontWeight', 'font-weight', 'bold'],
    ['fontStyle', 'font-style', 'italic'],
    ['optionUnderline', 'text-decoration', 'underline'],
    ['optionLineThrough', 'text-decoration', 'line-through'],
    ['optionCenter', 'text-align', 'center'],
    ['optionRight', 'text-align', 'right'],
    ['optionJustify', 'text-align', 'justify'],
  ] as const) {
    act(() => button(translate(`content.designReview.${key}`)).click());
    expect(localActions.updateValue).toHaveBeenLastCalledWith(property, value);
  }
  const modified = {
    'font-weight': 'bold',
    'font-style': 'italic',
    'text-decoration': 'underline line-through',
    'text-align': 'center',
  };
  render(modified);
  for (const [key, property, value] of [
    ['fontWeight', 'font-weight', '400'],
    ['fontStyle', 'font-style', 'normal'],
    ['optionUnderline', 'text-decoration', 'line-through'],
    ['optionLineThrough', 'text-decoration', 'underline'],
    ['optionCenter', 'text-align', 'left'],
  ] as const) {
    act(() => button(translate(`content.designReview.${key}`)).click());
    expect(localActions.updateValue).toHaveBeenLastCalledWith(property, value);
  }
  for (const key of ['textStyleGroup', 'textAlign'] as const) {
    act(() =>
      button(
        `${translate(`content.designReview.${key}`)}: ${translate('content.designReview.resetProperty')}`
      ).click()
    );
  }
  expect(localActions.resetValue.mock.calls).toEqual([
    ['font-weight'],
    ['font-style'],
    ['text-decoration'],
    ['text-align'],
  ]);
  const calls = localActions.updateValue.mock.calls.length;
  render(modified, true);
  const bold = button(translate('content.designReview.fontWeight'));
  expect(bold.disabled).toBe(true);
  act(() => bold.click());
  expect(localActions.updateValue).toHaveBeenCalledTimes(calls);
});

it('keeps section field updates attached to their page CSS property and selected image', async () => {
  const updateValue = vi.fn();
  const localActions = { ...actions, updateValue };
  act(() =>
    root.render(<DesignReviewSettings actions={localActions} disabled={false} state={state} />)
  );
  const button = (label: string) => {
    const found = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (node) => node.getAttribute('aria-label') === label
    );
    expect(found).toBeDefined();
    return found!;
  };
  const edit = (label: string, value: string) => {
    const input = Array.from(container.querySelectorAll<HTMLInputElement>('input')).find(
      (node) => node.getAttribute('aria-label') === label
    );
    expect(input).toBeDefined();
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
      input!.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  edit(translate('content.designReview.fontSize'), '18');
  expect(updateValue).toHaveBeenLastCalledWith('font-size', '18px');
  for (const [key, option, property] of [
    ['fontFamily', 'Inter', 'font-family'],
    ['lineHeight', '1.5', 'line-height'],
    ['letterSpacing', '1px', 'letter-spacing'],
  ] as const) {
    act(() => button(translate(`content.designReview.${key}`)).click());
    const choice = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]')).find(
      (node) => node.textContent?.trim() === option
    );
    expect(choice).toBeDefined();
    await act(async () => choice!.click());
    expect(updateValue).toHaveBeenLastCalledWith(property, expect.any(String));
  }
  act(() => button(translate('content.designReview.sectionFrame')).click());
  edit(translate('content.designReview.width'), '50%');
  expect(updateValue).toHaveBeenLastCalledWith('width', '50%');
  edit(translate('content.designReview.height'), '3em');
  expect(updateValue).toHaveBeenLastCalledWith('height', '3em');
  act(() => button(translate('content.designReview.sectionAppearance')).click());
  act(() => button(translate('content.designReview.boxShadow')).click());
  const enabled = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]')).find(
    (node) => node.textContent?.trim() === translate('content.designReview.shadowEnabled')
  );
  expect(enabled).toBeDefined();
  await act(async () => enabled!.click());
  expect(updateValue).toHaveBeenLastCalledWith('box-shadow', expect.any(String));
  const image = document.createElement('img');
  const selection = state.selection;
  if (!selection) throw new Error('Selection fixture is required');
  act(() =>
    root.render(
      <DesignReviewSettings
        actions={localActions}
        disabled={false}
        state={{
          ...state,
          selection: { ...selection, kind: 'image', element: image },
          values: { 'object-fit': 'fill', 'object-position': '50% 50%' },
        }}
      />
    )
  );
  act(() => button(translate('content.designReview.objectFit')).click());
  const cover = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]')).find(
    (node) => node.textContent?.trim() === translate('content.designReview.optionCover')
  );
  expect(cover).toBeDefined();
  await act(async () => cover!.click());
  expect(updateValue).toHaveBeenLastCalledWith('object-fit', 'cover');
  edit(translate('content.designReview.objectPosition'), '10% 20%');
  expect(updateValue).toHaveBeenLastCalledWith('object-position', '10% 20%');
});
