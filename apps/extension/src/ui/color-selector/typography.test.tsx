import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { PickerRgbFields } from './picker-channel-fields';
import { PickerManualColorField } from './picker-controls';
import { ColorSelectorSwatchSection } from './swatch-section';

it('uses compact inspector label typography in color selector sections', () => {
  const markup = renderToStaticMarkup(
    <>
      <ColorSelectorSwatchSection
        colors={['#112233']}
        label="Палитра"
        selectedColor="#112233"
        title="Цвет"
        onSelect={vi.fn()}
      />
      <PickerManualColorField mode="hex" value="#112233" onChange={vi.fn()} onCycle={vi.fn()} />
      <PickerRgbFields
        mode="rgb"
        red={17}
        green={34}
        blue={51}
        onRedChange={vi.fn()}
        onGreenChange={vi.fn()}
        onBlueChange={vi.fn()}
        onCycle={vi.fn()}
      />
    </>
  );

  expect(markup).toContain('text-[12px] font-semibold uppercase');
  expect(markup).not.toContain('tracking-[0.08em]');
});
