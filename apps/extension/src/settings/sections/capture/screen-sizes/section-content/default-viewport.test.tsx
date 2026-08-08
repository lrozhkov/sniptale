// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const selectPropsSpy = vi.hoisted(() => vi.fn());

vi.mock('@sniptale/ui/product-form-controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-form-controls')>()),
  ProductSelect: (props: {
    disabled: boolean;
    onChange: (value: string) => void;
    options: Array<{ label: string; value: string }>;
    value: string;
  }) => {
    selectPropsSpy(props);
    return (
      <select
        disabled={props.disabled}
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  },
}));

import { DefaultViewportField } from './default-viewport';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  selectPropsSpy.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('keeps current size as null and lists only enabled presets', () => {
  const onChange = vi.fn();
  act(() => {
    root?.render(
      <DefaultViewportField
        defaultViewportPresetId={null}
        isLoading
        onChange={onChange}
        viewportPresets={[
          {
            kind: 'user',
            id: 'viewport-1',
            name: 'Phone',
            target: 'viewport',
            width: 390,
            height: 844,
            enabled: true,
            order: 0,
          },
          {
            kind: 'user',
            id: 'window-disabled',
            name: 'Disabled window',
            target: 'window',
            width: 1280,
            height: 720,
            enabled: false,
            order: 0,
          },
        ]}
      />
    );
  });

  expect(selectPropsSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      disabled: true,
      options: [
        expect.objectContaining({ value: '' }),
        expect.objectContaining({ value: 'viewport-1' }),
      ],
      value: '',
    })
  );

  act(() => {
    const select = container?.querySelector('select');
    if (select) {
      select.value = 'viewport-1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  expect(onChange).toHaveBeenCalledWith('viewport-1');
});
