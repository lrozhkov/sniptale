import type { ColorSelectorFormatMode } from '@sniptale/ui/color-selector/types';
import { translate } from '../../platform/i18n';
import { PickerInputField, PickerModeLabelRow } from './picker-controls';

type PickerChannelField = {
  ariaLabel: string;
  max: number;
  onChange: (value: string) => void;
  value: number | string;
};

function PickerChannelFieldGrid(props: { fields: readonly PickerChannelField[] }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {props.fields.map((field) => (
        <PickerInputField
          key={field.ariaLabel}
          ariaLabel={field.ariaLabel}
          max={field.max}
          value={field.value}
          onChange={field.onChange}
        />
      ))}
    </div>
  );
}

export function PickerRgbFields(props: {
  blue: number | string;
  green: number | string;
  mode: ColorSelectorFormatMode;
  onBlueChange: (value: string) => void;
  onCycle: () => void;
  onGreenChange: (value: string) => void;
  onRedChange: (value: string) => void;
  red: number | string;
}) {
  return (
    <div className="space-y-1.5">
      <PickerModeLabelRow
        mode={props.mode}
        onCycle={props.onCycle}
        labels={[
          translate('shared.ui.colorSelectorRed'),
          translate('shared.ui.colorSelectorGreen'),
          translate('shared.ui.colorSelectorBlue'),
        ]}
      />
      <PickerChannelFieldGrid
        fields={[
          {
            ariaLabel: translate('shared.ui.colorSelectorRed'),
            max: 255,
            value: props.red,
            onChange: props.onRedChange,
          },
          {
            ariaLabel: translate('shared.ui.colorSelectorGreen'),
            max: 255,
            value: props.green,
            onChange: props.onGreenChange,
          },
          {
            ariaLabel: translate('shared.ui.colorSelectorBlue'),
            max: 255,
            value: props.blue,
            onChange: props.onBlueChange,
          },
        ]}
      />
    </div>
  );
}

export function PickerHslFields(props: {
  hue: number | string;
  lightness: number | string;
  mode: ColorSelectorFormatMode;
  onCycle: () => void;
  onHueChange: (value: string) => void;
  onLightnessChange: (value: string) => void;
  onSaturationChange: (value: string) => void;
  saturation: number | string;
}) {
  return (
    <div className="space-y-1.5">
      <PickerModeLabelRow
        mode={props.mode}
        onCycle={props.onCycle}
        labels={[
          translate('shared.ui.colorSelectorHue'),
          translate('shared.ui.colorSelectorSaturation'),
          translate('shared.ui.colorSelectorLightness'),
        ]}
      />
      <PickerChannelFieldGrid
        fields={[
          {
            ariaLabel: translate('shared.ui.colorSelectorHue'),
            max: 359,
            value: props.hue,
            onChange: props.onHueChange,
          },
          {
            ariaLabel: translate('shared.ui.colorSelectorSaturation'),
            max: 100,
            value: props.saturation,
            onChange: props.onSaturationChange,
          },
          {
            ariaLabel: translate('shared.ui.colorSelectorLightness'),
            max: 100,
            value: props.lightness,
            onChange: props.onLightnessChange,
          },
        ]}
      />
    </div>
  );
}
