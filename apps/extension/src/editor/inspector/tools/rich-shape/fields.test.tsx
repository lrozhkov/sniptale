// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { PercentRangeField, RangeField, SelectField } from './fields';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderField(element: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(element);
  });
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

it('routes rich-shape select fields through the shared compact select row', () => {
  const onChange = vi.fn();
  renderField(
    <SelectField
      label="Стиль"
      value="solid"
      options={[
        { label: 'Сплошная', value: 'solid' },
        { label: 'Пунктир', value: 'dash' },
      ]}
      onChange={onChange}
    />
  );

  expect(
    container?.querySelector('[data-ui="shared.ui.compact-inspector.select-field"]')
  ).not.toBeNull();
  expect(container?.querySelector('button')?.getAttribute('title')).toBe('Сплошная');
});

it('maps rich-shape range labels to compact numeric units', () => {
  renderField(
    <>
      <RangeField label="Padding" value={8} valueLabel="8px" onChange={vi.fn()} />
      <RangeField label="Opacity" value={40} valueLabel="40%" onChange={vi.fn()} />
      <RangeField label="Angle" value={90} valueLabel="90°" onChange={vi.fn()} />
      <RangeField label="Scale" value={2} valueLabel="2x" onChange={vi.fn()} />
      <RangeField label="Plain" value={1} valueLabel="plain" onChange={vi.fn()} />
    </>
  );

  expect(container?.querySelector('input[aria-label="Padding"]')?.getAttribute('value')).toBe('8');
  expect(container?.textContent).toContain('px');
  expect(container?.querySelector('input[aria-label="Opacity"]')?.getAttribute('value')).toBe('40');
  expect(container?.textContent).toContain('%');
  expect(container?.querySelector('input[aria-label="Angle"]')?.getAttribute('value')).toBe('90');
  expect(container?.textContent).toContain('°');
  expect(container?.querySelector('input[aria-label="Scale"]')?.getAttribute('value')).toBe('2');
  expect(container?.textContent).toContain('x');
  expect(container?.querySelector('input[aria-label="Plain"]')?.getAttribute('value')).toBe('1');
});

it('converts percent ranges for opacity and transparency settings', () => {
  const onOpacityChange = vi.fn();
  const onTransparencyChange = vi.fn();
  renderField(
    <>
      <PercentRangeField
        label="Opacity"
        value={0.25}
        valueKind="opacity"
        onChange={onOpacityChange}
      />
      <PercentRangeField label="Transparency" value={0.25} onChange={onTransparencyChange} />
    </>
  );

  const opacityRange = container?.querySelector(
    'input[aria-label="Opacity range"]'
  ) as HTMLInputElement | null;
  const transparencyRange = container?.querySelector(
    'input[aria-label="Transparency range"]'
  ) as HTMLInputElement | null;

  act(() => {
    opacityRange?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
      opacityRange,
      '20'
    );
    opacityRange?.dispatchEvent(new Event('input', { bubbles: true }));
    transparencyRange?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
      transparencyRange,
      '70'
    );
    transparencyRange?.dispatchEvent(new Event('input', { bubbles: true }));
  });

  expect(onOpacityChange).toHaveBeenCalledWith(0.8);
  expect(onTransparencyChange).toHaveBeenCalledWith(0.7);
});
