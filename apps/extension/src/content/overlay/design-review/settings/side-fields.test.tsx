// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DesignReviewActions, DesignReviewViewState } from '../types';
import { LinkedSideFields, SIDE_ORDER, createSideProperty } from './side-fields';

const marginProperties = SIDE_ORDER.map((side) => createSideProperty('margin', side));
const fieldKey = marginProperties.join('|');

function createState(values: DesignReviewViewState['values']): DesignReviewViewState {
  return {
    action: 'refine',
    anchor: null,
    comment: { commitFailed: false, draft: '', marker: null },
    defaultValues: { ...values },
    draftPatch: { declarations: [] },
    modifiedProperties: [],
    selection: null,
    settingsOpen: true,
    values,
    voice: {
      active: false,
      audioLevel: 0,
      caretPosition: null,
      errorCode: null,
      phase: 'idle',
    },
  };
}

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
  vi.unstubAllGlobals();
});

function renderSides(
  state: DesignReviewViewState,
  callbacks: {
    onChange?: DesignReviewActions['updateValue'];
    onChangeMany?: DesignReviewActions['updateValues'];
    onLinkedChange?: (fieldKey: string, linked: boolean) => void;
  } = {}
) {
  const onChange = callbacks.onChange ?? vi.fn<DesignReviewActions['updateValue']>();
  const onChangeMany = callbacks.onChangeMany ?? vi.fn<DesignReviewActions['updateValues']>();
  const onLinkedChange =
    callbacks.onLinkedChange ?? vi.fn<(key: string, linked: boolean) => void>();
  act(() => {
    root.render(
      <LinkedSideFields
        disabled={false}
        label="Внешние"
        properties={marginProperties}
        state={state}
        onChange={onChange}
        onChangeMany={onChangeMany}
        onLinkedChange={onLinkedChange}
      />
    );
  });
  return { onChange, onChangeMany, onLinkedChange };
}

it('shows four compact values with one global link and two expandable axis groups', () => {
  const equalValues = Object.fromEntries(marginProperties.map((property) => [property, '8px']));
  const { onLinkedChange } = renderSides(createState(equalValues));

  expect(
    container.querySelector('[data-ui="content.design-review.side-values-compact"]')
  ).not.toBeNull();
  expect(container.querySelectorAll('input')).toHaveLength(4);
  const unlink = container.querySelector<HTMLButtonElement>('button[data-side-link="all"]');
  expect(unlink?.getAttribute('aria-pressed')).toBe('true');
  act(() => unlink?.click());
  expect(onLinkedChange).toHaveBeenCalledWith(fieldKey, false);

  act(() => container.querySelector<HTMLButtonElement>('button[aria-expanded="false"]')?.click());
  expect(container.querySelectorAll('[data-side-axis]')).toHaveLength(2);
  expect(container.querySelector('[data-side-axis="vertical"]')).not.toBeNull();
  expect(container.querySelector('[data-side-axis="horizontal"]')).not.toBeNull();
});

it('shows four values for unequal sides or an explicit unlinked preference', () => {
  const unequalValues = Object.fromEntries(
    marginProperties.map((property, index) => [property, `${index + 1}px`])
  );
  renderSides(createState(unequalValues));
  expect(
    container.querySelector('button[data-side-link="all"]')?.getAttribute('aria-pressed')
  ).toBe('false');
  expect(container.querySelectorAll('input')).toHaveLength(4);

  const equalValues = Object.fromEntries(marginProperties.map((property) => [property, '8px']));
  renderSides({ ...createState(equalValues), sideFieldLinks: { [fieldKey]: false } });
  expect(container.querySelectorAll('input')).toHaveLength(4);
});

it('updates all four properties from any compact value while globally linked', () => {
  const equalValues = Object.fromEntries(marginProperties.map((property) => [property, '8px']));
  const onChangeMany = vi.fn();
  renderSides(createState(equalValues), { onChangeMany });
  const topInput = container.querySelector<HTMLInputElement>('[data-side-value="top"] input')!;
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

  act(() => {
    valueSetter?.call(topInput, '12');
    topInput.dispatchEvent(new Event('input', { bubbles: true }));
  });

  expect(onChangeMany).toHaveBeenLastCalledWith(
    marginProperties.map((property) => ({ property, value: '12px' }))
  );
});

it('links and unlinks the vertical pair independently in the expanded view', () => {
  const equalValues = Object.fromEntries(marginProperties.map((property) => [property, '8px']));
  const onChangeMany = vi.fn();
  renderSides(
    { ...createState(equalValues), sideFieldLinks: { [fieldKey]: false } },
    { onChangeMany }
  );
  act(() => container.querySelector<HTMLButtonElement>('button[aria-expanded="false"]')?.click());
  const verticalLink = container.querySelector<HTMLButtonElement>(
    'button[data-side-link="vertical"]'
  );
  expect(verticalLink?.getAttribute('aria-pressed')).toBe('true');

  act(() => verticalLink?.click());
  expect(verticalLink?.getAttribute('aria-pressed')).toBe('false');

  act(() => verticalLink?.click());
  expect(onChangeMany).toHaveBeenLastCalledWith([
    { property: 'margin-top', value: '8px' },
    { property: 'margin-bottom', value: '8px' },
  ]);
  expect(verticalLink?.getAttribute('aria-pressed')).toBe('true');
});
