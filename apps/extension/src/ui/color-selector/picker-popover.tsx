import { useRef } from 'react';
import { applyResolvedPickerColorChange } from '@sniptale/ui/color-selector/picker-change';
import { getColorFromPlanePoint } from '@sniptale/ui/color-selector/helpers';
import { PickerControls } from './picker-layout';
import { ColorPlane } from './picker-sections';
import { PickerFooter } from './picker-sections';
import {
  useEyedropper,
  useHslInputs,
  useManualColorInput,
  usePickerColorState,
  useRgbInputs,
} from '@sniptale/ui/color-selector/popover-state';
import type { ColorSelectorFormatMode } from '@sniptale/ui/color-selector/types';

const PANEL_CLASS_NAME = [
  'rounded-[14px] border p-3',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_48%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_98%,transparent)]',
  'text-[color:var(--sniptale-color-text-primary)]',
  'shadow-[0_20px_48px_color-mix(in_srgb,var(--sniptale-color-shadow-strong)_18%,transparent)]',
].join(' ');

type ColorSelectorPickerPopoverProps = {
  color: string;
  formatMode: ColorSelectorFormatMode;
  onApply: () => void;
  onCancel: () => void;
  onColorChange: (color: string) => void;
  onCycleFormatMode: () => void;
  onEyedropperStateChange: (active: boolean) => void;
  onSelectTransparent: () => void;
};

export function ColorSelectorPickerPopover(props: ColorSelectorPickerPopoverProps) {
  const planeRef = useRef<HTMLDivElement | null>(null);
  const color = usePickerColorState(props.color);
  const handlePickerColorChange = (nextColor: string) =>
    applyResolvedPickerColorChange({
      onColorChange: props.onColorChange,
      resolvedColor: color.handleColorChange(nextColor),
    });
  const manualColorInput = useManualColorInput(color.resolvedColor, handlePickerColorChange);
  const rgbInputs = useRgbInputs(color.resolvedColor, handlePickerColorChange);
  const hslInputs = useHslInputs(color.resolvedColor, handlePickerColorChange);
  const eyedropper = useEyedropper(handlePickerColorChange, props.onEyedropperStateChange);

  return (
    <div className={PANEL_CLASS_NAME} data-ui="shared.ui.color-selector.picker">
      <div className="space-y-3">
        <ColorPlane
          getColorFromPlanePoint={getColorFromPlanePoint}
          hue={color.hue}
          onSelectionChange={(nextSelection) => {
            props.onColorChange(color.handlePlaneSelectionChange(nextSelection));
          }}
          planeColor={color.planeColor}
          planeRef={planeRef}
          saturation={color.saturation}
          value={color.value}
        />
        <PickerControls
          color={color}
          eyedropper={eyedropper}
          formatMode={props.formatMode}
          hslInputs={hslInputs}
          manualColorInput={manualColorInput}
          onCycleFormatMode={props.onCycleFormatMode}
          onHueChange={(nextHue) =>
            applyResolvedPickerColorChange({
              onColorChange: props.onColorChange,
              resolvedColor: color.handleHueChange(nextHue),
            })
          }
          onSelectTransparent={props.onSelectTransparent}
          rgbInputs={rgbInputs}
        />
        <PickerFooter onApply={props.onApply} onCancel={props.onCancel} />
      </div>
    </div>
  );
}
