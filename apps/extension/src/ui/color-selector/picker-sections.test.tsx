import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import {
  PickerFooter,
  PickerHslFields,
  PickerManualColorField,
  PickerRgbFields,
  PickerToolbar,
  updatePlaneFromEvent,
} from './picker-sections';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

it('maps plane events into bounded plane colors', () => {
  expect(
    updatePlaneFromEvent(
      { clientX: 40, clientY: 20 } as PointerEvent,
      {
        getBoundingClientRect: () => ({ left: 10, top: 5, width: 50, height: 25 }),
      } as HTMLDivElement,
      180,
      ({ left, top }) => `#${left}-${top}`
    )
  ).toBe('#30-15');
});

it('renders the hollow-track hue control beside the system eyedropper', () => {
  const markup = renderToStaticMarkup(
    <PickerToolbar
      eyedropperAvailable
      eyedropperPressed
      handleEyedropperPick={async () => undefined}
      hue={180}
      onHueChange={() => undefined}
      onSelectTransparent={() => undefined}
      resolvedColor="#abcdef"
    />
  );
  expect(markup).toContain('sniptale-picker-range');
  expect(markup).toContain('lucide-pipette');
  expect(markup).toContain('aria-busy="true"');
  expect(markup).not.toContain('disabled=""');
});

it('omits the eyedropper when the runtime does not support it', () => {
  expect(
    renderToStaticMarkup(
      <PickerToolbar
        eyedropperAvailable={false}
        eyedropperPressed={false}
        handleEyedropperPick={async () => undefined}
        hue={180}
        onHueChange={() => undefined}
        onSelectTransparent={() => undefined}
        resolvedColor="#abcdef"
      />
    )
  ).not.toContain('lucide-pipette');
});

it('places three format choices above the hex field without a duplicate caption', () => {
  const markup = renderToStaticMarkup(
    <PickerManualColorField
      mode="hex"
      onChange={() => undefined}
      onCycle={() => undefined}
      value="#abcdef"
    />
  );
  expect(markup.match(/data-ui="shared.ui.color-selector.mode-cycle"/g)).toHaveLength(3);
  expect(markup).toContain('aria-pressed="true"');
  expect(markup).not.toContain('lucide-chevrons-up-down');
});

it('keeps channel affixes inside numeric fields', () => {
  const rgb = renderToStaticMarkup(
    <PickerRgbFields
      blue={30}
      green={20}
      red={10}
      mode="rgb"
      onBlueChange={() => undefined}
      onGreenChange={() => undefined}
      onRedChange={() => undefined}
      onCycle={() => undefined}
    />
  );
  const hsl = renderToStaticMarkup(
    <PickerHslFields
      hue={180}
      saturation={50}
      lightness={40}
      mode="hsl"
      onHueChange={() => undefined}
      onSaturationChange={() => undefined}
      onLightnessChange={() => undefined}
      onCycle={() => undefined}
    />
  );
  expect(rgb).toContain('aria-hidden="true">R</span>');
  expect(hsl).toContain('aria-hidden="true">H°</span>');
  expect(hsl).toContain('aria-hidden="true">S%</span>');
  expect(hsl).not.toContain('<label');
});

it('renders neutral actions and equally sized density utility', () => {
  const markup = renderToStaticMarkup(
    <PickerFooter
      onApply={() => undefined}
      onCancel={() => undefined}
      compact
      onToggleCompact={() => undefined}
    />
  );
  expect(markup).toContain('lucide-maximize-2');
  expect(markup).toContain('shared.ui.colorSelectorApply');
  expect(markup).not.toContain('color-accent');
});
