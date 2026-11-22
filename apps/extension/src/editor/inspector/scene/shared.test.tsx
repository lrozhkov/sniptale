// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

import {
  HeaderValueToggleSection,
  PanelSection,
  primaryPanelButtonClassName,
  secondaryPanelButtonClassName,
  EditorInspectorRangeField,
} from './shared';

it('accepts the old numeric origin after cancellation and an external value change', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const commit = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function Field() {
    const [value, setValue] = useState(10);
    const [accepted, setAccepted] = useState(10);
    return (
      <>
        <output>{accepted}</output>
        <button
          onClick={() => {
            setValue(20);
            setAccepted(20);
          }}
        >
          External value
        </button>
        <EditorInspectorRangeField
          label="Radius"
          value={value}
          min={0}
          max={100}
          unit="px"
          onPreview={setValue}
          onChange={(next) => {
            commit(next);
            setValue(next);
            setAccepted(next);
          }}
        />
      </>
    );
  }
  try {
    act(() => root.render(<Field />));
    const field = host.querySelector<HTMLInputElement>('input[type="text"]')!;
    const increase = host.querySelector<HTMLButtonElement>('button[aria-label="Radius increase"]')!;
    act(() => {
      field.focus();
      increase.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });
    expect(field.value).toBe('11');
    act(() =>
      field.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'z',
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        })
      )
    );
    act(() => window.dispatchEvent(new MouseEvent('pointerup')));
    expect(commit).not.toHaveBeenCalled();
    act(() => host.querySelector('button')!.click());
    expect(field.value).toBe('20');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, '10');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(commit).toHaveBeenCalledExactlyOnceWith(10);
    expect(host.querySelector('output')!.textContent).toBe('10');
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

function MockLabeledRow(props: { label: string; children: React.ReactNode }) {
  return <div>{props.children}</div>;
}

it('renders panel sections with labels, values, and children', () => {
  const markup = renderToStaticMarkup(
    <PanelSection
      label="Background"
      value="Solid"
      className="custom-panel"
      labelClassName="custom-label"
      valueClassName="custom-value"
    >
      <button type="button">child</button>
    </PanelSection>
  );

  expect(markup).toContain('Background');
  expect(markup).toContain('Solid');
  expect(markup).toContain('child');
  expect(markup).toContain('custom-panel');
  expect(markup).toContain('custom-label');
  expect(markup).toContain('custom-value');
});

it('omits duplicate section headers when the only child already owns the row label', () => {
  const markup = renderToStaticMarkup(
    <PanelSection label="Color" value="#ffffff">
      <MockLabeledRow label="Color">Color row</MockLabeledRow>
    </PanelSection>
  );

  expect(markup.match(/Color/g)).toHaveLength(1);
  expect(markup).not.toContain('#ffffff');
  expect(markup).toContain('Color row');
});

it('renders binary header toggles as compact option rows', () => {
  const markup = renderToStaticMarkup(
    <HeaderValueToggleSection
      active
      ariaLabel="Toggle grid"
      label="Grid"
      nextValue="disabled"
      value="On"
      onChange={() => undefined}
    />
  );

  expect(markup).toContain('shared.ui.compact-inspector.option-row');
  expect(markup).toContain('aria-pressed="true"');
});

it('exports stable primary and secondary button class names', () => {
  expect(primaryPanelButtonClassName).toContain('rounded-[var(--sniptale-radius-sm)]');
  expect(primaryPanelButtonClassName).toContain('disabled:opacity-50');
  expect(secondaryPanelButtonClassName).toContain('border-none');
  expect(secondaryPanelButtonClassName).toContain(
    'hover:text-[color:var(--sniptale-color-text-primary)]'
  );
});

it('omits the value badge when a panel section has no value', () => {
  const markup = renderToStaticMarkup(
    <PanelSection label="Background">
      <button type="button">child</button>
    </PanelSection>
  );

  expect(markup).toContain('Background');
  expect(markup).toContain('rounded-[4px]');
  expect(markup).not.toContain('uppercase');
  expect(markup).not.toContain('tracking-[0.14em]');
});
