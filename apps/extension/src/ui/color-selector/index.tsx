import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { useAppLocale } from '../../platform/i18n';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
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

function PickerLayer(props: {
  state: ReturnType<typeof useColorSelectorState>;
  options: CompactColorSelectorProps;
  ownerId: string;
}) {
  const { state, options } = props;
  const rootNode = state.rootRef.current;
  const portalTarget =
    typeof document === 'undefined' ? null : resolveThemeSafePortalTarget(rootNode);
  const portalTheme = useResolvedPortalTheme(rootNode);
  const layerStyle = useColorSelectorLayerStyle(
    rootNode,
    state.pickerOpen,
    options.floatingPlacement ?? 'auto',
    options.floatingBoundaryRef?.current ?? null,
    state.layerRef,
    'picker'
  );
  if (!state.pickerOpen || !portalTarget) return null;
  const finish = (apply: boolean) => {
    if (apply) state.handlePickerApply();
    else state.handlePickerCancel();
    state.rootRef.current?.querySelector('button')?.focus({ preventScroll: true });
  };
  return createPortal(
    <ColorSelectorFloatingLayer
      layerRef={state.layerRef}
      ownerId={props.ownerId}
      portalTheme={portalTheme}
      style={layerStyle}
      ui="shared.ui.color-selector.picker-layer"
    >
      <ColorSelectorPickerPopover
        allowAlpha={options.allowAlpha !== false}
        allowTransparent={options.allowTransparent !== false}
        color={state.draftColor}
        formatMode={state.formatMode}
        eyedropper={state.eyedropper}
        palette={state.normalizedPalette}
        recentColors={state.normalizedRecentColors}
        title={options.title}
        onApply={() => finish(true)}
        onCancel={() => finish(false)}
        onColorChange={state.handleDraftColorChange}
        onCycleFormatMode={state.cycleFormatMode}
        onSelectTransparent={state.handleSelectTransparent}
      />
    </ColorSelectorFloatingLayer>,
    portalTarget
  );
}

/** Color swatch opens a transactional picker; the value offers independent text editing. */
export function CompactColorSelector(props: CompactColorSelectorProps) {
  useAppLocale();
  const floatingOwnerId = useId();
  const state = useColorSelectorState({
    onChange: props.onChange,
    onPreviewChange: props.onPreviewChange,
    onPreviewReset: props.onPreviewReset,
    palette: props.palette,
    recentColors: props.recentColors,
    value: props.value,
  });
  const { pickerOpen, handlePickerCancel } = state;
  const { onOpenChange } = props;
  useEffect(() => {
    if (props.disabled && pickerOpen) handlePickerCancel();
  }, [props.disabled, pickerOpen, handlePickerCancel]);
  useEffect(() => {
    onOpenChange?.(pickerOpen);
  }, [onOpenChange, pickerOpen]);
  return (
    <div
      ref={state.rootRef}
      {...{ [FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE]: floatingOwnerId }}
      data-ui="shared.ui.color-selector"
      data-open={pickerOpen ? 'true' : 'false'}
      className={`relative w-full min-w-0 max-w-full ${props.className ?? ''}`}
    >
      <ColorSelectorTrigger
        variant={props.triggerVariant ?? 'value'}
        active={pickerOpen}
        disabled={props.disabled === true}
        formatMode={state.formatMode}
        label={props.label}
        value={state.draftColor}
        onCommit={state.handleRecentSelect}
        onOpenPicker={state.handleOpenPicker}
        allowAlpha={props.allowAlpha !== false}
        allowTransparent={props.allowTransparent !== false}
      />
      <PickerLayer state={state} options={props} ownerId={floatingOwnerId} />
    </div>
  );
}
