// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import { SCENARIO_V3_ELEMENT_KINDS } from '@sniptale/runtime-contracts/scenario/types/v3';
import { ScenarioElementInsertMenu } from './insert-menu';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderInsertMenu() {
  const onInsertElement = vi.fn();

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(<ScenarioElementInsertMenu onInsertElement={onInsertElement} />);
  });

  return { onInsertElement };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('scenario v3 element insert menu', () => {
  it('exposes one insert action for each v3 element kind', () => {
    const { onInsertElement } = renderInsertMenu();
    const buttons = container?.querySelectorAll<HTMLButtonElement>('button') ?? [];

    expect([...buttons].map((button) => button.getAttribute('aria-label'))).toEqual([
      translate('scenario.editor.insertText'),
      translate('scenario.editor.insertShape'),
      translate('scenario.editor.insertLine'),
      translate('scenario.editor.insertArrow'),
      translate('scenario.editor.insertCallout'),
      translate('scenario.editor.insertCode'),
    ]);

    act(() => {
      buttons.forEach((button) => button.click());
    });

    expect(onInsertElement.mock.calls.map((call) => call[0])).toEqual([
      SCENARIO_V3_ELEMENT_KINDS.text,
      SCENARIO_V3_ELEMENT_KINDS.shape,
      SCENARIO_V3_ELEMENT_KINDS.line,
      SCENARIO_V3_ELEMENT_KINDS.arrow,
      SCENARIO_V3_ELEMENT_KINDS.callout,
      SCENARIO_V3_ELEMENT_KINDS.code,
    ]);
  });

  it('renders insert actions with the shared editor icon button contract', () => {
    renderInsertMenu();

    const firstButton = container?.querySelector<HTMLButtonElement>('button');

    expect(container?.querySelector('[data-ui="scenario.toolbar.insert-menu"]')).not.toBeNull();
    expect(firstButton?.className).toContain('h-9 w-9');
    expect(firstButton?.className).toContain('rounded-[8px]');
    expect(firstButton?.getAttribute('data-active')).toBe('false');
  });
});
