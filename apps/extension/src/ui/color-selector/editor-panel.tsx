import { useRef } from 'react';
import { applyResolvedPickerColorChange } from '@sniptale/ui/color-selector/picker-change';
import { getColorFromPlanePoint } from '@sniptale/ui/color-selector/helpers';
import { PickerControls } from './picker-layout';
import { ColorPlane } from './picker-sections';
import {
  useEyedropper,
  useHslInputs,
  useManualColorInput,
  usePickerColorState,
  useRgbInputs,
} from '@sniptale/ui/color-selector/popover-state';
import type { ColorSelectorFormatMode } from '@sniptale/ui/color-selector/types';

type ColorEditorPanelProps = {
  allowAlpha?: boolean;
  allowTransparent?: boolean;
  color: string;
  formatMode: ColorSelectorFormatMode;
  onColorChange: (color: string) => void;
  onCycleFormatMode: () => void;
  onEyedropperStateChange: (active: boolean) => void;
  onSelectTransparent: () => void;
};

export function ColorEditorPanel(props: ColorEditorPanelProps) {
  const planeRef = useRef<HTMLDivElement | null>(null);
  const color = usePickerColorState(props.color);
  const emit = (resolvedColor: string | null) =>
    applyResolvedPickerColorChange({ onColorChange: props.onColorChange, resolvedColor });
  const handlePickerColorChange = (nextColor: string) => emit(color.handleColorChange(nextColor));
  const manualColorInput = useManualColorInput(color.resolvedColor, handlePickerColorChange);
  const handleChannelColorChange = (nextColor: string) =>
    emit(color.handleChannelColorChange(nextColor));
  const handleAlphaChange = (nextAlpha: string) => emit(color.handleAlphaChange(nextAlpha));
  const rgbInputs = useRgbInputs(color.resolvedColor, handleChannelColorChange);
  const hslInputs = useHslInputs(color.resolvedColor, handleChannelColorChange);
  const eyedropper = useEyedropper(handleChannelColorChange, props.onEyedropperStateChange);
  return (
    <div className="space-y-3" data-ui="shared.ui.color-selector.editor-panel">
      <ColorPlane
        getColorFromPlanePoint={getColorFromPlanePoint}
        hue={color.hue}
        onSelectionChange={(selection) =>
          props.onColorChange(color.handlePlaneSelectionChange(selection))
        }
        planeColor={color.planeColor}
        planeRef={planeRef}
        saturation={color.saturation}
        value={color.value}
      />
      <PickerControls
        allowAlpha={props.allowAlpha !== false}
        allowTransparent={props.allowTransparent !== false}
        color={color}
        eyedropper={eyedropper}
        formatMode={props.formatMode}
        hslInputs={hslInputs}
        manualColorInput={manualColorInput}
        onAlphaChange={handleAlphaChange}
        onCycleFormatMode={props.onCycleFormatMode}
        onHueChange={(hue) => emit(color.handleHueChange(hue))}
        onSelectTransparent={props.onSelectTransparent}
        rgbInputs={rgbInputs}
      />
    </div>
  );
}
