// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { BorderPadding } from '../../../../features/highlighter/contracts';
import { BorderPaddingFields } from './border-padding-fields';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement;
let root: Root;
let padding: BorderPadding;

function Harness() {
  const [value, setValue] = useState<BorderPadding>({ top: 2, right: 2, bottom: 2, left: 2 });
  padding = value;
  return <BorderPaddingFields onChange={setValue} padding={value} />;
}

function getSideInput(side: keyof BorderPadding) {
  const input = container.querySelector<HTMLInputElement>(`[data-padding-side="${side}"] input`);
  if (!input) throw new Error(`Missing padding input: ${side}`);
  return input;
}

async function enterSideValue(side: keyof BorderPadding, value: number) {
  const input = getSideInput(side);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    input.focus();
    setter?.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
  });
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

it('keeps vertical and horizontal padding as independently linkable pairs', async () => {
  const globalLink = container.querySelector<HTMLButtonElement>('[data-padding-link="all"]');
  expect(globalLink?.getAttribute('aria-pressed')).toBe('true');
  expect(container.querySelectorAll('[data-padding-side] input')).toHaveLength(1);

  await act(async () => globalLink?.click());
  expect(container.querySelectorAll('[data-padding-side] input')).toHaveLength(2);
  expect(container.querySelector('[data-ui="shared.border-padding-expanded"]')).not.toBeNull();

  expect(
    container
      .querySelector<HTMLButtonElement>('[data-padding-link="vertical"]')
      ?.getAttribute('aria-pressed')
  ).toBe('true');
  expect(
    container
      .querySelector<HTMLButtonElement>('[data-padding-link="horizontal"]')
      ?.getAttribute('aria-pressed')
  ).toBe('true');

  await enterSideValue('top', 8);
  expect(padding).toMatchObject({ top: 8, bottom: 8, left: 2, right: 2 });

  await act(async () =>
    container.querySelector<HTMLButtonElement>('[data-padding-link="vertical"]')?.click()
  );
  expect(container.querySelectorAll('[data-padding-side] input')).toHaveLength(3);
  await enterSideValue('top', 9);
  expect(padding).toMatchObject({ top: 9, bottom: 8 });

  await act(async () => globalLink?.click());
  expect(padding).toEqual({ top: 9, right: 9, bottom: 9, left: 9 });
});
