import { useEffect, useRef, useState } from 'react';
import { getColorAlpha, setColorAlpha } from '@sniptale/foundation/color';
import { normalizeColorSelectorValue } from '@sniptale/ui/color-selector/helpers';
import { PickerComparison } from './picker-comparison';
import { applyResolvedPickerColorChange } from '@sniptale/ui/color-selector/picker-change';
import { getColorFromPlanePoint } from '@sniptale/ui/color-selector/helpers';
import { PickerControls } from './picker-layout';
import { ColorPlane } from './picker-sections';
import { ColorCatalogPanel } from './catalog-panel';
import { useCatalogPlacement } from './catalog-state';
import {
  useHslInputs,
  usePickerColorState,
  useRgbInputs,
} from '@sniptale/ui/color-selector/popover-state';
import type { useEyedropper } from '@sniptale/ui/color-selector/popover-state';
import type { ColorSelectorFormatMode } from '@sniptale/ui/color-selector/types';

function displayHex(color: string) {
  return color.toUpperCase().slice(0, 7);
}

type ColorEditorPanelProps = {
  compact?: boolean | undefined;
  catalogMode?: boolean | undefined;
  onCatalogExit?: (() => void) | undefined;
  originalColor?: string | undefined;
  allowAlpha?: boolean | undefined;
  allowTransparent?: boolean | undefined;
  color: string;
  eyedropper: ReturnType<typeof useEyedropper>;
  formatMode: ColorSelectorFormatMode;
  onColorChange: (color: string) => void;
  onCycleFormatMode: () => void;
  onSelectTransparent: () => void;
};

export function ColorEditorPanel(props: ColorEditorPanelProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const placement = useCatalogPlacement(editorRef, props.catalogMode === true);
  const initialColor = useRef(props.color);
  const planeRef = useRef<HTMLDivElement | null>(null);
  const color = usePickerColorState(props.color);
  const emit = (resolvedColor: string | null) =>
    applyResolvedPickerColorChange({
      onColorChange: props.onColorChange,
      resolvedColor:
        resolvedColor && props.allowAlpha === false && resolvedColor !== 'transparent'
          ? (setColorAlpha(resolvedColor, 1) ?? resolvedColor)
          : resolvedColor,
    });
  const handlePickerColorChange = (nextColor: string) => emit(color.handleColorChange(nextColor));
  const [manualColor, setManualColor] = useState(displayHex(color.resolvedColor));
  const manualEcho = useRef<string | null>(null);
  const hexAlpha = useRef(getColorAlpha(color.resolvedColor) ?? 1);
  useEffect(() => {
    if (manualEcho.current === color.resolvedColor) {
      manualEcho.current = null;
      return;
    }
    setManualColor(displayHex(color.resolvedColor));
  }, [color.resolvedColor]);
  useEffect(() => {
    if (props.compact) {
      setManualColor(displayHex(color.resolvedColor));
    }
  }, [props.compact, color.resolvedColor]);
  const manualColorInput = {
    manualColor,
    handleFocus: () => {
      hexAlpha.current = getColorAlpha(color.resolvedColor) ?? 1;
    },
    handleBlur: () => {
      if (
        normalizeColorSelectorValue(manualColor.startsWith('#') ? manualColor : `#${manualColor}`)
      )
        setManualColor(displayHex(color.resolvedColor));
    },
    handleManualColorChange: (value: string) => {
      setManualColor(value);
      const normalized = normalizeColorSelectorValue(value.startsWith('#') ? value : `#${value}`);
      if (!normalized || normalized === 'transparent') return;
      const digits = value.replace(/^#/, '').length;
      const next =
        digits === 3 || digits === 6
          ? (setColorAlpha(normalized, hexAlpha.current) ?? normalized)
          : normalized;
      manualEcho.current = next;
      handlePickerColorChange(next);
    },
  };
  const handleChannelColorChange = (nextColor: string) =>
    emit(color.handleChannelColorChange(nextColor));
  const handleAlphaChange = (nextAlpha: string) => emit(color.handleAlphaChange(nextAlpha));
  const rgbInputs = useRgbInputs(color.resolvedColor, handleChannelColorChange);
  const hslInputs = useHslInputs(color.resolvedColor, handleChannelColorChange);
  return (
    <div
      ref={editorRef}
      data-catalog-mode={props.catalogMode === true}
      className="relative @container/picker space-y-3 [--sniptale-compact-control-height:32px]"
      data-ui="shared.ui.color-selector.editor-panel"
    >
      {props.catalogMode && (
        <div
          className="sniptale-color-catalog-overlay"
          style={{ top: placement.top, height: placement.height }}
        >
          <ColorCatalogPanel
            color={color.resolvedColor}
            onColorChange={handlePickerColorChange}
            onExit={() => props.onCatalogExit?.()}
          />
        </div>
      )}
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
        compact={props.compact}
        allowAlpha={props.allowAlpha !== false}
        allowTransparent={props.allowTransparent !== false}
        color={color}
        eyedropper={props.eyedropper}
        formatMode={props.formatMode}
        hslInputs={hslInputs}
        manualColorInput={manualColorInput}
        onAlphaChange={handleAlphaChange}
        onCycleFormatMode={props.onCycleFormatMode}
        onHueChange={(hue) => emit(color.handleHueChange(hue))}
        onSelectTransparent={props.onSelectTransparent}
        rgbInputs={rgbInputs}
      />
      {!props.compact ? (
        <PickerComparison
          originalColor={props.originalColor ?? initialColor.current}
          color={color.resolvedColor}
          onColorChange={handlePickerColorChange}
        />
      ) : null}
    </div>
  );
}
