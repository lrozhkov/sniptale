import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';

import {
  HeaderValueToggleSection,
  PanelSection,
  primaryPanelButtonClassName,
  secondaryPanelButtonClassName,
} from './shared';

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
  expect(primaryPanelButtonClassName).toContain('rounded-[12px]');
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
  expect(markup).toContain('rounded-[14px]');
  expect(markup).toContain('text-[12px] font-bold uppercase');
  expect(markup).not.toContain('tracking-[0.14em]');
});
