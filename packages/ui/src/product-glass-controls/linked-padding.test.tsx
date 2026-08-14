// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  ProductGlassLinkedPaddingFields,
  type ProductGlassLinkedPaddingValue,
} from './linked-padding';

let container: HTMLDivElement;
let root: Root;
let padding: ProductGlassLinkedPaddingValue;
let setExternalPadding: (value: ProductGlassLinkedPaddingValue) => void = () => undefined;

const labels = {
  padding: 'Padding',
  top: 'Top',
  right: 'Right',
  bottom: 'Bottom',
  left: 'Left',
  link: 'Link',
  unlink: 'Unlink',
};

function Harness() {
  const [value, setValue] = useState<ProductGlassLinkedPaddingValue>({
    top: 2,
    right: 2,
    bottom: 2,
    left: 2,
  });
  const [, setRevision] = useState(0);
  padding = value;
  setExternalPadding = setValue;
  return (
    <>
      <button data-unrelated-rerender onClick={() => setRevision((current) => current + 1)} />
      <ProductGlassLinkedPaddingFields
        labels={labels}
        onChange={setValue}
        padding={{ ...value }}
        renderValueField={({ label, onChange, side, value: sideValue }) => (
          <button data-padding-side={side} onClick={() => onChange(8)} type="button">
            {label}:{sideValue}
          </button>
        )}
      />
    </>
  );
}

function UniformFieldHarness() {
  const [value, setValue] = useState<ProductGlassLinkedPaddingValue>({
    top: 4,
    right: 4,
    bottom: 4,
    left: 4,
  });
  padding = value;
  return (
    <ProductGlassLinkedPaddingFields
      labels={labels}
      onChange={setValue}
      padding={value}
      renderUniformField={({ onChange, value: uniformValue }) => (
        <button data-uniform-padding onClick={() => onChange(12)} type="button">
          Uniform:{uniformValue}
        </button>
      )}
      renderValueField={({ label, onChange, side, value: sideValue }) => (
        <button data-padding-side={side} onClick={() => onChange(8)} type="button">
          {label}:{sideValue}
        </button>
      )}
    />
  );
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('keeps all, vertical, and horizontal padding independently linkable', async () => {
  const globalLink = container.querySelector<HTMLButtonElement>('[data-padding-link="all"]');
  expect(globalLink?.getAttribute('aria-pressed')).toBe('true');

  await act(async () =>
    container.querySelector<HTMLButtonElement>('[data-padding-side="top"]')?.click()
  );
  expect(padding).toEqual({ top: 8, right: 8, bottom: 8, left: 8 });

  await act(async () => globalLink?.click());
  expect(container.querySelector('[data-ui="shared.linked-padding-expanded"]')).not.toBeNull();

  await act(async () =>
    container.querySelector<HTMLButtonElement>('[data-padding-link="vertical"]')?.click()
  );
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[data-padding-side="top"]')?.click()
  );
  expect(padding).toMatchObject({ top: 8, bottom: 8 });
});

it('supports a persistent uniform control before padding is split by side', async () => {
  await act(async () => root.render(<UniformFieldHarness />));

  expect(container.querySelector('[data-uniform-padding]')?.textContent).toBe('Uniform:4');
  expect(container.querySelector('[data-padding-side="top"]')).toBeNull();

  await act(async () =>
    container.querySelector<HTMLButtonElement>('[data-uniform-padding]')?.click()
  );

  expect(padding).toEqual({ top: 12, right: 12, bottom: 12, left: 12 });
});

it('preserves an explicit unlink across a same-value controlled rerender', async () => {
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[data-padding-link="all"]')?.click()
  );
  expect(container.querySelector('[data-padding-link="all"]')?.getAttribute('aria-pressed')).toBe(
    'false'
  );

  await act(async () =>
    container.querySelector<HTMLButtonElement>('[data-unrelated-rerender]')?.click()
  );

  expect(container.querySelector('[data-padding-link="all"]')?.getAttribute('aria-pressed')).toBe(
    'false'
  );
  expect(container.querySelector('[data-ui="shared.linked-padding-expanded"]')).not.toBeNull();
});

it('reconciles link controls when the authoritative padding changes externally', async () => {
  expect(container.querySelector('[data-padding-link="all"]')?.getAttribute('aria-pressed')).toBe(
    'true'
  );

  await act(async () => setExternalPadding({ top: 1, right: 2, bottom: 3, left: 4 }));
  expect(container.querySelector('[data-padding-link="all"]')?.getAttribute('aria-pressed')).toBe(
    'false'
  );
  expect(container.querySelector('[data-ui="shared.linked-padding-expanded"]')).not.toBeNull();

  await act(async () => setExternalPadding({ top: 6, right: 6, bottom: 6, left: 6 }));
  expect(container.querySelector('[data-padding-link="all"]')?.getAttribute('aria-pressed')).toBe(
    'true'
  );
  expect(container.querySelector('[data-ui="shared.linked-padding-expanded"]')).toBeNull();
});
