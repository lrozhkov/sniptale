// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../glass-select/overlay-state', () => ({
  useGlassSelectOverlay: () => ({
    menuPosition: 'top' as const,
  }),
}));

import { ProductSelect } from '@sniptale/ui/product-form-controls';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderElement(element: React.ReactElement) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(element);
  });
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

function verifyTopPositionedSmallSelect() {
  renderElement(
    <ProductSelect
      value=""
      onChange={() => undefined}
      placeholder="Choose option"
      controlSize="sm"
      options={[
        {
          value: 'one',
          label: 'One',
          description: 'First option',
          icon: <span data-testid="branch-icon">icon</span>,
        },
        { value: 'two', label: 'Two' },
      ]}
    />
  );

  const trigger = container?.querySelector('button');
  const chevron = trigger?.querySelector('.sniptale-select-chevron');
  expect(trigger?.className).toContain('sniptale-select-sm');
  expect(chevron?.getAttribute('class')).toContain('sniptale-select-chevron-edge');
  expect(trigger?.textContent).toContain('Choose option');

  act(() => {
    trigger?.click();
  });

  const shell = container?.querySelector('[data-ui="shared.ui.product-select"]');
  const menu = container?.querySelector('[role="listbox"]');
  expect(shell?.className).toContain('sniptale-select-shell-sm');
  expect(menu?.className).toContain('sniptale-select-menu-top');
  expect(menu?.textContent).toContain('First option');
  expect(menu?.querySelector('[data-testid="branch-icon"]')).not.toBeNull();
}

function verifyDisabledSelectBranches() {
  const onChange = vi.fn();

  renderElement(
    <div>
      <ProductSelect
        value=""
        disabled
        onChange={onChange}
        placeholder="Disabled"
        options={[{ value: 'one', label: 'One' }]}
      />
      <ProductSelect
        value="one"
        onChange={onChange}
        options={[
          { value: 'one', label: 'One' },
          { value: 'two', label: 'Two', disabled: true },
        ]}
      />
    </div>
  );

  const triggers = Array.from(
    container?.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="listbox"]') ?? []
  );

  act(() => {
    triggers[0]?.click();
  });

  expect(container?.querySelectorAll('[role="listbox"]')).toHaveLength(0);

  act(() => {
    triggers[1]?.click();
  });

  const disabledOption = Array.from(
    container?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []
  ).find((option) => option.textContent?.includes('Two'));

  expect(disabledOption?.className).toContain('sniptale-select-option-disabled');

  act(() => {
    disabledOption?.click();
  });

  expect(onChange).not.toHaveBeenCalledWith('two');
}

describe('ProductSelect branch coverage', () => {
  it('renders placeholder, small shell, and top-positioned menu', verifyTopPositionedSmallSelect);

  it(
    'keeps disabled triggers closed and ignores disabled option selection',
    verifyDisabledSelectBranches
  );
});
