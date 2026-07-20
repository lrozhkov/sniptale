import { type CSSProperties, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAppLocale } from '../../platform/i18n';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import { ColorSelectorExpandedPanel } from './expanded';
import {
  ColorSelectorFloatingLayer,
  useColorSelectorLayerStyle,
} from '@sniptale/ui/color-selector/floating-layer';
import { ColorSelectorPickerPopover } from './picker-popover';
import { useColorSelectorState } from '@sniptale/ui/color-selector/state';
import { ColorSelectorTrigger } from './trigger';
import type { CompactColorSelectorProps } from '@sniptale/ui/color-selector/types';

export type { CompactColorSelectorProps } from '@sniptale/ui/color-selector/types';

function ColorSelectorHeader(props: {
  active: boolean;
  expanded: boolean;
  formatMode: ReturnType<typeof useColorSelectorState>['formatMode'];
  label: string;
  title: string;
  value: string;
  onOpenPicker: () => void;
  onToggleExpanded: () => void;
}) {
  return (
    <ColorSelectorTrigger
      active={props.active}
      expanded={props.expanded}
      formatMode={props.formatMode}
      label={props.label}
      title={props.title}
      value={props.value}
      onToggleExpanded={props.onToggleExpanded}
      onOpenPicker={props.onOpenPicker}
    />
  );
}

type ColorSelectorPanelsProps = {
  cycleFormatMode: () => void;
  draftColor: string;
  expanded: boolean;
  formatMode: ReturnType<typeof useColorSelectorState>['formatMode'];
  normalizedPalette: readonly string[];
  normalizedRecentColors: readonly string[];
  pickerOpen: boolean;
  setEyedropperActive: (active: boolean) => void;
  title: string;
  value: string;
  onApply: () => void;
  onCancel: () => void;
  onColorChange: (color: string) => void;
  onSelectTransparent: () => void;
  onSelect: (color: string) => void;
  rootNode: HTMLDivElement | null;
  state: ReturnType<typeof useColorSelectorState>;
};

function ColorSelectorExpandedLayer(
  props: ColorSelectorPanelsProps & {
    layerStyle: CSSProperties;
    portalTheme: string | null;
  }
) {
  if (!props.expanded) {
    return null;
  }

  return (
    <ColorSelectorFloatingLayer
      layerRef={props.state.layerRef}
      portalTheme={props.portalTheme}
      style={props.layerStyle}
      ui="shared.ui.color-selector.expanded-layer"
    >
      <ColorSelectorExpandedPanel
        palette={props.normalizedPalette}
        recentColors={props.normalizedRecentColors}
        title={props.title}
        value={props.value}
        onSelect={props.onSelect}
      />
    </ColorSelectorFloatingLayer>
  );
}

function ColorSelectorPickerLayer(
  props: ColorSelectorPanelsProps & {
    layerStyle: CSSProperties;
    portalTheme: string | null;
  }
) {
  if (!props.pickerOpen) {
    return null;
  }

  return (
    <ColorSelectorFloatingLayer
      layerRef={props.state.layerRef}
      portalTheme={props.portalTheme}
      style={props.layerStyle}
      ui="shared.ui.color-selector.picker-layer"
    >
      <ColorSelectorPickerPopover
        color={props.draftColor}
        formatMode={props.formatMode}
        onApply={props.onApply}
        onCancel={props.onCancel}
        onColorChange={props.onColorChange}
        onCycleFormatMode={props.cycleFormatMode}
        onEyedropperStateChange={props.setEyedropperActive}
        onSelectTransparent={props.onSelectTransparent}
      />
    </ColorSelectorFloatingLayer>
  );
}

function ColorSelectorPanels(props: ColorSelectorPanelsProps) {
  const open = props.expanded || props.pickerOpen;
  const portalTarget =
    typeof document === 'undefined' ? null : resolveThemeSafePortalTarget(props.rootNode);
  const portalTheme = useResolvedPortalTheme(props.rootNode);
  const layerStyle = useColorSelectorLayerStyle(props.rootNode, open);

  if (!open || !portalTarget) {
    return null;
  }

  return createPortal(
    <>
      <ColorSelectorExpandedLayer {...props} layerStyle={layerStyle} portalTheme={portalTheme} />
      <ColorSelectorPickerLayer {...props} layerStyle={layerStyle} portalTheme={portalTheme} />
    </>,
    portalTarget
  );
}

function ColorSelectorBody(props: {
  className: string | undefined;
  label: string;
  state: ReturnType<typeof useColorSelectorState>;
  title: string;
}) {
  return (
    <div
      ref={props.state.rootRef}
      data-ui="shared.ui.color-selector"
      data-open={props.state.expanded || props.state.pickerOpen ? 'true' : 'false'}
      className={props.className ? `relative w-full ${props.className}` : 'relative w-full'}
    >
      <ColorSelectorHeader
        active={props.state.expanded || props.state.pickerOpen}
        expanded={props.state.expanded}
        formatMode={props.state.formatMode}
        label={props.label}
        title={props.title}
        value={props.state.draftColor}
        onToggleExpanded={props.state.handleToggleExpanded}
        onOpenPicker={props.state.handleOpenPicker}
      />
      <ColorSelectorPanels
        cycleFormatMode={props.state.cycleFormatMode}
        draftColor={props.state.draftColor}
        expanded={props.state.expanded}
        formatMode={props.state.formatMode}
        normalizedPalette={props.state.normalizedPalette}
        normalizedRecentColors={props.state.normalizedRecentColors}
        pickerOpen={props.state.pickerOpen}
        setEyedropperActive={props.state.setEyedropperActive}
        title={props.title}
        value={props.state.draftColor}
        onApply={props.state.handlePickerApply}
        onCancel={props.state.handlePickerCancel}
        onColorChange={props.state.handleDraftColorChange}
        onSelectTransparent={props.state.handleSelectTransparent}
        onSelect={props.state.handleSwatchSelect}
        rootNode={props.state.rootRef.current}
        state={props.state}
      />
    </div>
  );
}

export function CompactColorSelector({
  className,
  label,
  onChange,
  onOpenChange,
  onPreviewChange,
  onPreviewReset,
  palette = [],
  recentColors = [],
  title,
  value,
}: CompactColorSelectorProps) {
  useAppLocale();
  const state = useColorSelectorState({
    onChange,
    onPreviewChange,
    onPreviewReset,
    palette,
    recentColors,
    value,
  });
  const open = state.expanded || state.pickerOpen;
  useEffect(() => {
    onOpenChange?.(open);
  }, [onOpenChange, open]);

  return <ColorSelectorBody className={className} label={label} state={state} title={title} />;
}
