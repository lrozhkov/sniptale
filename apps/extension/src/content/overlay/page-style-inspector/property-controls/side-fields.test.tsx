// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { PAGE_STYLE_INSPECTOR_TABS } from '@sniptale/runtime-contracts/page-style';
import type { PageStyleInspectorActions, PageStyleInspectorViewState } from '../types';
import { LinkedSideFields, createSideFieldKey } from './side-fields';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

const SIDE_PROPERTIES = ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'] as const;

function createState(
  values: Partial<PageStyleInspectorViewState['values']> = {}
): PageStyleInspectorViewState {
  const resolvedValues = {
    'margin-bottom': '8px',
    'margin-left': '8px',
    'margin-right': '8px',
    'margin-top': '8px',
    ...values,
  };

  return {
    activeTab: PAGE_STYLE_INSPECTOR_TABS.PROPERTIES,
    defaultValues: resolvedValues,
    draftPatch: { assets: [], declarations: [] },
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
    values: resolvedValues,
  };
}

function renderField(
  actions: Pick<PageStyleInspectorActions, 'updateValue' | 'updateValues'> = {
    updateValue: vi.fn(),
    updateValues: vi.fn(),
  },
  state = createState()
) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <LinkedSideFields
        disabled={false}
        label="Внешние"
        properties={[...SIDE_PROPERTIES]}
        state={state}
        onChange={actions.updateValue}
        onChangeMany={actions.updateValues}
      />
    );
  });
  return actions;
}

function renderStatefulField(
  actions: Pick<PageStyleInspectorActions, 'updateValue' | 'updateValues'> = {
    updateValue: vi.fn(),
    updateValues: vi.fn(),
  },
  state = createState()
) {
  function Harness() {
    const [sideFieldLinks, setSideFieldLinks] = useState<Record<string, boolean>>({});
    return (
      <LinkedSideFields
        disabled={false}
        label="Внешние"
        properties={[...SIDE_PROPERTIES]}
        state={{ ...state, sideFieldLinks }}
        onChange={actions.updateValue}
        onChangeMany={actions.updateValues}
        onLinkedChange={(fieldKey, linked) =>
          setSideFieldLinks((current) => ({ ...current, [fieldKey]: linked }))
        }
      />
    );
  }

  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(<Harness />);
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
});

it('starts unlinked and renders all four side inputs in one row', () => {
  renderField();

  expect(document.querySelector('input[aria-label="Внешние"]')).toBeNull();
  expect(document.querySelectorAll('input[aria-label="Верх"]')).toHaveLength(1);
  expect(document.querySelectorAll('input[aria-label="Право"]')).toHaveLength(1);
  expect(document.querySelectorAll('input[aria-label="Низ"]')).toHaveLength(1);
  expect(document.querySelectorAll('input[aria-label="Лево"]')).toHaveLength(1);
  expect(
    document.querySelector('[data-ui="content.page-style-inspector.side-values"]')?.className
  ).toContain('grid-cols-4');
});

it('links side values through one grouped update after the user chooses linked mode', () => {
  const actions = renderStatefulField();
  const linkButton = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Связать стороны"]'
  );
  act(() => {
    linkButton?.click();
  });

  const linkedInput = document.querySelector<HTMLInputElement>('input[aria-label="Внешние"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(linkedInput, '12');
    linkedInput?.dispatchEvent(new Event('input', { bubbles: true }));
  });

  expect(actions.updateValues).toHaveBeenCalledWith(
    SIDE_PROPERTIES.map((property) => ({ property, value: '12px' }))
  );
});

it('uses the side field view model instead of local component state', () => {
  renderField(undefined, {
    ...createState(),
    sideFieldLinks: { [createSideFieldKey([...SIDE_PROPERTIES])]: true },
  });

  expect(document.querySelector('input[aria-label="Внешние"]')).not.toBeNull();
  expect(document.querySelector('input[aria-label="Верх"]')).toBeNull();
});
