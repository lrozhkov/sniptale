// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SourceImageFilterFields } from './source-image-filter-fields';
import {
  createSourceImageFilter,
  type SourceImageFilterStack,
} from '../features/image-filters/contract';
vi.mock('../platform/i18n', async (original) => ({
  ...(await original<typeof import('../platform/i18n')>()),
  translate: (key: string) => key,
}));
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function button(label: string, scope: ParentNode = host) {
  const item = [...scope.querySelectorAll('button')].find(
    (item) => item.getAttribute('aria-label') === label || item.textContent === label
  );
  if (!item) throw new Error('Missing button ' + label);
  return item;
}
it(
  'authors a controlled ordered stack with intensity parameters ' +
    'toggles and deletion without mutating the input',
  () => {
    const initial: SourceImageFilterStack = {
        version: 1,
        filters: [createSourceImageFilter('blur', 'existing')],
      },
      before = structuredClone(initial);
    let current: SourceImageFilterStack | undefined = initial;
    function Harness() {
      const [value, setValue] = useState<SourceImageFilterStack | undefined>(initial);
      current = value;
      return <SourceImageFilterFields value={value} onChange={setValue} />;
    }
    act(() => root.render(<Harness />));
    act(() => button('videoEditor.sidebar.sourceFiltersAddColor').click());
    expect(current?.filters.map((item) => item.kind)).toEqual(['blur', 'color']);
    const color = host.querySelector<HTMLElement>('[data-source-filter-id]:last-child');
    if (!color) throw new Error('Missing color');
    const input = color.querySelector<HTMLInputElement>(
      'input[aria-label="videoEditor.sidebar.sourceFiltersBrightness"]'
    );
    if (!input) throw new Error('Missing brightness');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        '1.75'
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(current?.filters[1]?.parameters).toMatchObject({ brightness: 1.75 });
    const intensity = color.querySelector<HTMLInputElement>(
      'input[aria-label="videoEditor.sidebar.sourceFiltersIntensity"]'
    );
    if (!intensity) throw new Error('Missing intensity');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        intensity,
        '35'
      );
      intensity.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() =>
      intensity.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    );
    expect(current?.filters[1]?.intensity).toBe(0.35);
    act(() => button('videoEditor.sidebar.sourceFiltersUp', color).click());
    expect(current?.filters.map((item) => item.kind)).toEqual(['color', 'blur']);
    act(() => button('videoEditor.sidebar.sourceFiltersEnabled', color).click());
    expect(current?.filters[0]?.enabled).toBe(false);
    act(() => button('common.actions.delete', color).click());
    expect(current?.filters.map((item) => item.id)).toEqual(['existing']);
    act(() => button('common.actions.delete').click());
    expect(current).toBeUndefined();
    expect(initial).toEqual(before);
  }
);
it('keeps every command disabled when locked and refuses to exceed the stack bound', () => {
  const value: SourceImageFilterStack = {
      version: 1,
      filters: Array.from({ length: 16 }, (_, index) =>
        createSourceImageFilter('blur', 'filter-' + index)
      ),
    },
    onChange = vi.fn();
  act(() => root.render(<SourceImageFilterFields value={value} onChange={onChange} />));
  expect(button('videoEditor.sidebar.sourceFiltersAddColor').disabled).toBe(true);
  act(() => root.render(<SourceImageFilterFields value={value} disabled onChange={onChange} />));
  expect(
    [...host.querySelectorAll('button,input')].every((item) => item.matches(':disabled'))
  ).toBe(true);
  act(() => button('common.actions.delete').click());
  expect(onChange).not.toHaveBeenCalled();
});

it.each(['Monochrome', 'Sepia', 'Sharpen', 'Pixelate', 'Vignette', 'Grain'] as const)(
  'adds the validated %s operation through the controlled inspector',
  (name) => {
    let current: SourceImageFilterStack | undefined;
    function Harness() {
      const [value, setValue] = useState<SourceImageFilterStack>();
      current = value;
      return <SourceImageFilterFields value={value} onChange={setValue} />;
    }
    act(() => root.render(<Harness />));
    act(() => button('videoEditor.sidebar.sourceFiltersAdd' + name).click());
    expect(current?.filters).toHaveLength(1);
    expect(current?.filters[0]?.kind).toBe(name.toLowerCase());
    if (name === 'Grain')
      expect(current?.filters[0]?.parameters).toEqual({ amount: 0.1, seed: 1337 });
  }
);
