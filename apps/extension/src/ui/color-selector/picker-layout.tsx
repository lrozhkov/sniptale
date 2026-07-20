import {
  PickerHslFields,
  PickerManualColorField,
  PickerRgbFields,
  PickerToolbar,
} from './picker-sections';
import type {
  useEyedropper,
  useFormatMode,
  useHslInputs,
  useManualColorInput,
  usePickerColorState,
  useRgbInputs,
} from '@sniptale/ui/color-selector/popover-state';
import type { ColorSelectorFormatMode } from '@sniptale/ui/color-selector/types';

function PickerFields(props: {
  formatMode: ColorSelectorFormatMode;
  hslInputs: ReturnType<typeof useHslInputs>;
  manualColorInput: ReturnType<typeof useManualColorInput>;
  onCycleFormatMode: () => void;
  rgbInputs: ReturnType<typeof useRgbInputs>;
}) {
  switch (props.formatMode) {
    case 'hex':
      return (
        <PickerManualColorField
          mode={props.formatMode}
          onCycle={props.onCycleFormatMode}
          value={props.manualColorInput.manualColor}
          onChange={props.manualColorInput.handleManualColorChange}
        />
      );
    case 'rgb':
      return (
        <PickerRgbFields
          mode={props.formatMode}
          red={props.rgbInputs.rgbFields.red}
          green={props.rgbInputs.rgbFields.green}
          blue={props.rgbInputs.rgbFields.blue}
          onCycle={props.onCycleFormatMode}
          onRedChange={props.rgbInputs.handleRedChange}
          onGreenChange={props.rgbInputs.handleGreenChange}
          onBlueChange={props.rgbInputs.handleBlueChange}
        />
      );
    case 'hsl':
      return (
        <PickerHslFields
          mode={props.formatMode}
          hue={props.hslInputs.hslFields.hue}
          saturation={props.hslInputs.hslFields.saturation}
          lightness={props.hslInputs.hslFields.lightness}
          onCycle={props.onCycleFormatMode}
          onHueChange={props.hslInputs.handleHueChange}
          onSaturationChange={props.hslInputs.handleSaturationChange}
          onLightnessChange={props.hslInputs.handleLightnessChange}
        />
      );
  }
}

export function PickerControls(props: {
  color: ReturnType<typeof usePickerColorState>;
  eyedropper: ReturnType<typeof useEyedropper>;
  formatMode: ReturnType<typeof useFormatMode>['formatMode'];
  hslInputs: ReturnType<typeof useHslInputs>;
  manualColorInput: ReturnType<typeof useManualColorInput>;
  onCycleFormatMode: () => void;
  onHueChange: (nextHue: string) => void;
  onSelectTransparent: () => void;
  rgbInputs: ReturnType<typeof useRgbInputs>;
}) {
  return (
    <div className="space-y-3">
      <PickerToolbar
        eyedropperAvailable={props.eyedropper.eyedropperAvailable}
        eyedropperPressed={props.eyedropper.eyedropperPressed}
        handleEyedropperPick={props.eyedropper.handleEyedropperPick}
        hue={props.color.hue}
        onHueChange={props.onHueChange}
        onSelectTransparent={props.onSelectTransparent}
        resolvedColor={props.color.resolvedColor}
      />
      <PickerFields
        formatMode={props.formatMode}
        hslInputs={props.hslInputs}
        manualColorInput={props.manualColorInput}
        onCycleFormatMode={props.onCycleFormatMode}
        rgbInputs={props.rgbInputs}
      />
    </div>
  );
}
