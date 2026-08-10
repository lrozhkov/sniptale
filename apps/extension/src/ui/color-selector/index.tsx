import { type CSSProperties, useEffect, useId } from 'react';
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
import { FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE } from '@sniptale/ui/floating-interactions/ownership';

export type { CompactColorSelectorProps } from '@sniptale/ui/color-selector/types';

function ColorSelectorHeader(props: {
  active: boolean;
  disabled: boolean;
  expanded: boolean;
  formatMode: ReturnType<typeof useColorSelectorState>['formatMode'];
  label: string;
  pickerOnly: boolean;
  title: string;
  value: string;
  onOpenPicker: () => void;
  onToggleExpanded: () => void;
}) {
  return (
    <ColorSelectorTrigger
      active={props.active}
      disabled={props.disabled}
      expanded={props.expanded}
      formatMode={props.formatMode}
      label={props.label}
      showPaletteButton={!props.pickerOnly}
      title={props.title}
      value={props.value}
      onToggleExpanded={props.onToggleExpanded}
      onOpenPicker={props.onOpenPicker}
    />
  );
}

type ColorSelectorPanelsProps = {
  allowAlpha: boolean;
  allowTransparent: boolean;
  cycleFormatMode: () => void;
  draftColor: string;
  expanded: boolean;
  floatingBoundaryRef: CompactColorSelectorProps['floatingBoundaryRef'];
  floatingOwnerId: string;
  floatingPlacement: NonNullable<CompactColorSelectorProps['floatingPlacement']>;
  formatMode: ReturnType<typeof useColorSelectorState>['formatMode'];
  normalizedPalette: readonly string[];
  normalizedRecentColors: readonly string[];
  pickerOpen: boolean;
  title: string;
  value: string;
  onApply: () => void;
  onCancel: () => void;
  onColorChange: (color: string) => void;
  onSelectTransparent: () => void;
  onPaletteSelect: (color: string) => void;
  onRecentSelect: (color: string) => void;
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
      ownerId={props.floatingOwnerId}
      portalTheme={props.portalTheme}
      style={props.layerStyle}
      ui="shared.ui.color-selector.expanded-layer"
    >
      <ColorSelectorExpandedPanel
        palette={props.normalizedPalette}
        recentColors={props.normalizedRecentColors}
        title={props.title}
        value={props.value}
        onPaletteSelect={props.onPaletteSelect}
        onRecentSelect={props.onRecentSelect}
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
      ownerId={props.floatingOwnerId}
      portalTheme={props.portalTheme}
      style={props.layerStyle}
      ui="shared.ui.color-selector.picker-layer"
    >
      <ColorSelectorPickerPopover
        allowAlpha={props.allowAlpha}
        allowTransparent={props.allowTransparent}
        color={props.draftColor}
        formatMode={props.formatMode}
        eyedropper={props.state.eyedropper}
        onApply={props.onApply}
        onCancel={props.onCancel}
        onColorChange={props.onColorChange}
        onCycleFormatMode={props.cycleFormatMode}
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
  const layerStyle = useColorSelectorLayerStyle(
    props.rootNode,
    open,
    props.floatingPlacement,
    props.floatingBoundaryRef?.current ?? null
  );

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
  allowAlpha: boolean;
  allowTransparent: boolean;
  className: string | undefined;
  disabled: boolean;
  floatingBoundaryRef: CompactColorSelectorProps['floatingBoundaryRef'];
  floatingOwnerId: string;
  floatingPlacement: NonNullable<CompactColorSelectorProps['floatingPlacement']>;
  label: string;
  pickerOnly: boolean;
  state: ReturnType<typeof useColorSelectorState>;
  title: string;
}) {
  return (
    <div
      ref={props.state.rootRef}
      {...{ [FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE]: props.floatingOwnerId }}
      data-ui="shared.ui.color-selector"
      data-open={props.state.expanded || props.state.pickerOpen ? 'true' : 'false'}
      className={
        props.className
          ? `relative w-full min-w-0 max-w-full ${props.className}`
          : 'relative w-full min-w-0 max-w-full'
      }
    >
      <ColorSelectorHeader
        active={props.state.expanded || props.state.pickerOpen}
        disabled={props.disabled}
        expanded={props.state.expanded}
        formatMode={props.state.formatMode}
        label={props.label}
        pickerOnly={props.pickerOnly}
        title={props.title}
        value={props.state.draftColor}
        onToggleExpanded={props.state.handleToggleExpanded}
        onOpenPicker={props.state.handleOpenPicker}
      />
      <ColorSelectorPanels
        allowAlpha={props.allowAlpha}
        allowTransparent={props.allowTransparent}
        cycleFormatMode={props.state.cycleFormatMode}
        draftColor={props.state.draftColor}
        expanded={props.state.expanded}
        floatingBoundaryRef={props.floatingBoundaryRef}
        floatingOwnerId={props.floatingOwnerId}
        floatingPlacement={props.floatingPlacement}
        formatMode={props.state.formatMode}
        normalizedPalette={props.state.normalizedPalette}
        normalizedRecentColors={props.state.normalizedRecentColors}
        pickerOpen={props.state.pickerOpen}
        title={props.title}
        value={props.state.draftColor}
        onApply={props.state.handlePickerApply}
        onCancel={props.state.handlePickerCancel}
        onColorChange={props.state.handleDraftColorChange}
        onSelectTransparent={props.state.handleSelectTransparent}
        onPaletteSelect={props.state.handlePaletteSelect}
        onRecentSelect={props.state.handleRecentSelect}
        rootNode={props.state.rootRef.current}
        state={props.state}
      />
    </div>
  );
}

export function CompactColorSelector({
  allowAlpha = true,
  allowTransparent = true,
  className,
  disabled = false,
  floatingBoundaryRef,
  floatingPlacement = 'auto',
  label,
  onChange,
  onOpenChange,
  onPreviewChange,
  onPreviewReset,
  palette = [],
  pickerOnly = false,
  recentColors = [],
  title,
  value,
}: CompactColorSelectorProps) {
  useAppLocale();
  const floatingOwnerId = useId();
  const state = useColorSelectorState({
    onChange,
    onPreviewChange,
    onPreviewReset,
    palette,
    recentColors,
    value,
  });
  const open = state.expanded || state.pickerOpen;
  const { expanded, handlePickerCancel, handleToggleExpanded, pickerOpen } = state;
  useEffect(() => {
    if (!disabled) return;
    if (pickerOpen) {
      handlePickerCancel();
      return;
    }
    if (expanded) handleToggleExpanded();
  }, [disabled, expanded, handlePickerCancel, handleToggleExpanded, pickerOpen]);

  useEffect(() => {
    onOpenChange?.(open);
  }, [onOpenChange, open]);

  return (
    <ColorSelectorBody
      allowAlpha={allowAlpha}
      allowTransparent={allowTransparent}
      className={className}
      disabled={disabled}
      floatingBoundaryRef={floatingBoundaryRef}
      floatingOwnerId={floatingOwnerId}
      floatingPlacement={floatingPlacement}
      label={label}
      pickerOnly={pickerOnly}
      state={state}
      title={title}
    />
  );
}
