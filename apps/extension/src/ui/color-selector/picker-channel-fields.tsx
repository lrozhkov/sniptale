import type { ColorSelectorFormatMode } from '@sniptale/ui/color-selector/types';
import { translate } from '../../platform/i18n';
import { PickerModeLabelRow, PickerNumericInputField } from './picker-controls';

type PickerChannelField = {
  ariaLabel: string;
  prefix?: string | undefined;
  unit?: string | undefined;
  max: number;
  onChange: (value: string) => void;
  value: number | string;
};

function PickerChannelFieldGrid(props: { fields: readonly PickerChannelField[] }) {
  return (
    <div className="grid min-w-0 grid-cols-3 gap-2">
      {props.fields.map((field) => (
        <PickerNumericInputField
          key={field.ariaLabel}
          ariaLabel={field.ariaLabel}
          max={field.max}
          prefix={field.prefix}
          unit={field.unit}
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
    <div className="grid min-w-0 gap-2">
      <PickerModeLabelRow mode={props.mode} onCycle={props.onCycle} />
      <PickerChannelFieldGrid
        fields={[
          {
            ariaLabel: translate('shared.ui.colorSelectorRed'),
            unit: 'R',
            max: 255,
            value: props.red,
            onChange: props.onRedChange,
          },
          {
            ariaLabel: translate('shared.ui.colorSelectorGreen'),
            unit: 'G',
            max: 255,
            value: props.green,
            onChange: props.onGreenChange,
          },
          {
            ariaLabel: translate('shared.ui.colorSelectorBlue'),
            unit: 'B',
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
    <div className="grid min-w-0 gap-2">
      <PickerModeLabelRow mode={props.mode} onCycle={props.onCycle} />
      <PickerChannelFieldGrid
        fields={[
          {
            ariaLabel: translate('shared.ui.colorSelectorHue'),
            unit: 'H°',
            max: 359,
            value: props.hue,
            onChange: props.onHueChange,
          },
          {
            ariaLabel: translate('shared.ui.colorSelectorSaturation'),
            unit: 'S%',
            max: 100,
            value: props.saturation,
            onChange: props.onSaturationChange,
          },
          {
            ariaLabel: translate('shared.ui.colorSelectorLightness'),
            unit: 'L%',
            max: 100,
            value: props.lightness,
            onChange: props.onLightnessChange,
          },
        ]}
      />
    </div>
  );
}
