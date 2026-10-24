import {
  PickerHslFields,
  PickerManualColorField,
  PickerRgbFields,
  PickerToolbar,
} from './picker-sections';
import { PickerNumberField } from './picker-number-field';
import { PickerRange } from './picker-toolbar';
import { translate } from '../../platform/i18n';
import type {
  useEyedropper,
  useFormatMode,
  useHslInputs,
  useManualColorInput,
  usePickerColorState,
  useRgbInputs,
} from '@sniptale/ui/color-selector/popover-state';
import type { ColorSelectorFormatMode } from '@sniptale/ui/color-selector/types';

function alphaGradient(rgb: { red: number; green: number; blue: number }) {
  const channels = [rgb.red, rgb.green, rgb.blue].join(',');
  return `linear-gradient(to right,rgba(${channels},0),rgb(${channels}))`;
}

function PickerFields(props: {
  formatMode: ColorSelectorFormatMode;
  hslInputs: ReturnType<typeof useHslInputs>;
  manualColorInput: ReturnType<typeof useManualColorInput> & {
    handleFocus?: (() => void) | undefined;
    handleBlur?: () => void;
  };
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
          onFocus={props.manualColorInput.handleFocus}
          onBlur={props.manualColorInput.handleBlur}
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
  compact?: boolean | undefined;
  allowAlpha?: boolean | undefined;
  allowTransparent?: boolean | undefined;
  color: ReturnType<typeof usePickerColorState>;
  eyedropper: ReturnType<typeof useEyedropper>;
  formatMode: ReturnType<typeof useFormatMode>['formatMode'];
  hslInputs: ReturnType<typeof useHslInputs>;
  manualColorInput: ReturnType<typeof useManualColorInput> & {
    handleFocus?: (() => void) | undefined;
    handleBlur?: () => void;
  };
  onAlphaChange: (nextAlpha: string) => void;
  onCycleFormatMode: () => void;
  onHueChange: (nextHue: string) => void;
  onSelectTransparent: () => void;
  rgbInputs: ReturnType<typeof useRgbInputs>;
}) {
  return (
    <div className="space-y-1">
      <PickerToolbar
        showTransparentAction={props.allowAlpha === false && props.allowTransparent !== false}
        allowTransparent={props.allowTransparent !== false}
        eyedropperAvailable={props.eyedropper.eyedropperAvailable}
        eyedropperPressed={props.eyedropper.eyedropperPressed}
        handleEyedropperPick={props.eyedropper.handleEyedropperPick}
        hue={props.color.hue}
        onHueChange={props.onHueChange}
        onSelectTransparent={props.onSelectTransparent}
        resolvedColor={props.color.resolvedColor}
      />
      {props.allowAlpha !== false ? (
        <div
          className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-3"
          data-ui="shared.ui.color-selector.opacity"
        >
          <PickerRange
            label={translate('shared.ui.colorSelectorAlpha')}
            min={0}
            max={100}
            value={props.color.alphaPercent}
            onChange={props.onAlphaChange}
            checker
            background={alphaGradient(props.color.rgbColor)}
          />
          <PickerNumberField
            ariaLabel={translate('shared.ui.colorSelectorAlpha')}
            min={0}
            max={100}
            unit="%"
            value={props.color.alphaPercent}
            onChange={props.onAlphaChange}
          />
        </div>
      ) : null}
      {!props.compact ? (
        <div className="pt-2">
          <PickerFields
            formatMode={props.formatMode}
            hslInputs={props.hslInputs}
            manualColorInput={props.manualColorInput}
            onCycleFormatMode={props.onCycleFormatMode}
            rgbInputs={props.rgbInputs}
          />
        </div>
      ) : null}
    </div>
  );
}
