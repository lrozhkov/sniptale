// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DesignReviewViewState } from '../types';
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

function renderSides(state: DesignReviewViewState, onLinkedChange = vi.fn()) {
  act(() => {
    root.render(
      <LinkedSideFields
        disabled={false}
        label="Внешние"
        properties={marginProperties}
        state={state}
        onChange={vi.fn()}
        onChangeMany={vi.fn()}
        onLinkedChange={onLinkedChange}
      />
    );
  });
  return onLinkedChange;
}

it('starts equal computed sides linked and exposes one compact value', () => {
  const equalValues = Object.fromEntries(marginProperties.map((property) => [property, '8px']));
  const onLinkedChange = renderSides(createState(equalValues));

  expect(container.querySelector('[data-ui="content.design-review.side-values"]')).toBeNull();
  expect(container.querySelectorAll('input')).toHaveLength(1);
  const unlink = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Развязать стороны"]'
  );
  act(() => unlink?.click());
  expect(onLinkedChange).toHaveBeenCalledWith(fieldKey, false);
});

it('shows four values for unequal sides or an explicit unlinked preference', () => {
  const unequalValues = Object.fromEntries(
    marginProperties.map((property, index) => [property, `${index + 1}px`])
  );
  renderSides(createState(unequalValues));
  expect(container.querySelector('[data-ui="content.design-review.side-values"]')).not.toBeNull();
  expect(container.querySelectorAll('input')).toHaveLength(4);

  const equalValues = Object.fromEntries(marginProperties.map((property) => [property, '8px']));
  renderSides({ ...createState(equalValues), sideFieldLinks: { [fieldKey]: false } });
  expect(container.querySelectorAll('input')).toHaveLength(4);
});
