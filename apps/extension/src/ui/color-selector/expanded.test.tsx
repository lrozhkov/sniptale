import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

import { PickerHslFields, PickerRgbFields } from './picker-channel-fields';
import { PickerManualColorField } from './picker-controls';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

it('renders manual picker mode labels without legacy letter spacing', () => {
  const markup = renderToStaticMarkup(
    <>
      <PickerManualColorField mode="hex" value="#111111" onChange={vi.fn()} onCycle={vi.fn()} />
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
      <PickerHslFields
        mode="hsl"
        hue={12}
        saturation={50}
        lightness={30}
        onHueChange={vi.fn()}
        onSaturationChange={vi.fn()}
        onLightnessChange={vi.fn()}
        onCycle={vi.fn()}
      />
    </>
  );

  expect(markup).toContain('text-[12px] font-semibold uppercase');
  expect(markup).not.toContain('tracking-[0.08em]');
});
