import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { PickerControls } from './picker-layout';

vi.mock('../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

function createProps() {
  return {
    color: {
      handleColorChange: vi.fn(),
      handleHueChange: vi.fn(),
      handlePlaneSelectionChange: vi.fn(),
      hue: 180,
      planeColor: '#00ffff',
      resolvedColor: '#abcdef',
      rgbColor: { red: 171, green: 205, blue: 239 },
      saturation: 0.5,
      value: 0.75,
    },
    eyedropper: {
      eyedropperAvailable: true,
      eyedropperPressed: false,
      handleEyedropperPick: vi.fn(async () => undefined),
    },
    hslInputs: {
      hslFields: { hue: '180', saturation: '50', lightness: '40' },
      handleHueChange: vi.fn(),
      handleLightnessChange: vi.fn(),
      handleSaturationChange: vi.fn(),
    },
    manualColorInput: {
      handleManualColorChange: vi.fn(),
      manualColor: '#ABCDEF',
    },
    onCycleFormatMode: vi.fn(),
    onHueChange: vi.fn(),
    onSelectTransparent: vi.fn(),
    rgbInputs: {
      handleBlueChange: vi.fn(),
      handleGreenChange: vi.fn(),
      handleRedChange: vi.fn(),
      rgbFields: { red: '171', green: '205', blue: '239' },
    },
  };
}

it('renders the hex mode toolbar and hex field group', () => {
  const markup = renderToStaticMarkup(<PickerControls {...createProps()} formatMode="hex" />);

  expect(markup).toContain('shared.ui.colorSelectorTransparent');
  expect(markup).toContain('shared.ui.colorSelectorHex');
  expect(markup).toContain('shared.ui.colorSelectorEyedropper');
  expect(markup).not.toContain('shared.ui.colorSelectorRed');
  expect(markup).not.toContain('shared.ui.colorSelectorHue');
});

it('renders the rgb field group when rgb mode is active', () => {
  const markup = renderToStaticMarkup(<PickerControls {...createProps()} formatMode="rgb" />);

  expect(markup).toContain('shared.ui.colorSelectorRed');
  expect(markup).toContain('shared.ui.colorSelectorGreen');
  expect(markup).toContain('shared.ui.colorSelectorBlue');
});

it('renders the hsl field group when hsl mode is active', () => {
  const markup = renderToStaticMarkup(<PickerControls {...createProps()} formatMode="hsl" />);

  expect(markup).toContain('shared.ui.colorSelectorHue');
  expect(markup).toContain('shared.ui.colorSelectorSaturation');
  expect(markup).toContain('shared.ui.colorSelectorLightness');
});

it('omits the eyedropper action when the runtime does not support it', () => {
  const props = createProps();
  props.eyedropper.eyedropperAvailable = false;

  const markup = renderToStaticMarkup(<PickerControls {...props} formatMode="hex" />);

  expect(markup).not.toContain('shared.ui.colorSelectorEyedropper');
});
