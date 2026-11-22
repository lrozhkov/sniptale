import { getColorAlpha, setColorAlpha } from '@sniptale/foundation/color';
import { ColorSelectorFloatingLayer } from '@sniptale/ui/color-selector/floating-layer';
import { isEyedropperSessionActive } from '@sniptale/ui/color-selector/popover-state';
import { useColorSelectorState } from '@sniptale/ui/color-selector/state';
import {
  FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE,
  getOwnedFloatingInteractionLayers,
} from '@sniptale/ui/floating-interactions/ownership';
import { bindFloatingInteractionPositionListeners } from '@sniptale/ui/floating-interactions/placement';
import { isComposedEventWithinAnyElement } from '@sniptale/ui/dom-events';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { usePickerPreferences } from './reference-picker-preferences';
import { translate } from '../../../apps/extension/src/platform/i18n';
import { ColorSelectorPickerPopover } from '../../../apps/extension/src/ui/color-selector/picker-popover';

const gap = 6;
const margin = 8;
const pickerWidth = 304;

function getPickerStyle(anchor: HTMLElement, layer: HTMLElement): CSSProperties {
  const rect = anchor.getBoundingClientRect();
  const viewport = anchor.ownerDocument.documentElement;
  const width = Math.max(0, Math.min(pickerWidth, viewport.clientWidth - margin * 2));
  const body = layer.querySelector<HTMLElement>('[data-color-picker-body]');
  const hiddenHeight = body ? body.scrollHeight - body.clientHeight : 0;
  const desiredHeight = layer.clientHeight + hiddenHeight;
  const below = viewport.clientHeight - rect.bottom - gap - margin;
  const above = rect.top - gap - margin;
  const placeAbove = below < desiredHeight && above > below;
  const maxLeft = viewport.clientWidth - margin - width;
  const alignedLeft = rect.left <= maxLeft ? rect.left : rect.right - width;
  const left = Math.max(margin, Math.min(alignedLeft, maxLeft));

  return {
    width,
    left,
    top: placeAbove ? rect.top - gap : rect.bottom + gap,
    maxHeight: Math.max(0, placeAbove ? above : below),
    transform: placeAbove ? 'translateY(-100%)' : undefined,
  };
}

function usePickerPlacement(
  open: boolean,
  anchorRef: RefObject<HTMLDivElement | null>,
  layerRef: RefObject<HTMLDivElement | null>
) {
  const [style, setStyle] = useState<CSSProperties>({ width: pickerWidth, visibility: 'hidden' });
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const layer = layerRef.current;
    if (!open || !anchor || !layer) return;
    const update = () => setStyle(getPickerStyle(anchor, layer));
    const unbind = bindFloatingInteractionPositionListeners(anchor, update);
    const observer = new ResizeObserver(update);
    observer.observe(anchor);
    observer.observe(layer);
    const body = layer.querySelector('[data-color-picker-body]');
    if (body) observer.observe(body);
    return () => {
      unbind?.();
      observer.disconnect();
    };
  }, [open, anchorRef, layerRef]);
  return style;
}

function usePickerFocus(
  open: boolean,
  triggerRef: RefObject<HTMLDivElement | null>,
  layerRef: RefObject<HTMLDivElement | null>,
  cancel: () => void
) {
  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!open || !layer) return;
    layer.tabIndex = -1;
    layer.focus({ preventScroll: true });
  }, [open, layerRef]);

  useEffect(() => {
    const layer = layerRef.current;
    const trigger = triggerRef.current;
    const root = layer?.getRootNode();
    if (!open || !layer || !trigger || !(root instanceof Document || root instanceof ShadowRoot))
      return;

    const handleFocus = (event: Event) => {
      if (isEyedropperSessionActive()) return;
      const owners = [trigger, layer, ...getOwnedFloatingInteractionLayers(layer, root)];
      if (!isComposedEventWithinAnyElement(event, owners)) cancel();
    };
    const document = layer.ownerDocument;
    root.addEventListener('focusin', handleFocus, true);
    if (root !== document) document.addEventListener('focusin', handleFocus, true);
    return () => {
      root.removeEventListener('focusin', handleFocus, true);
      if (root !== document) document.removeEventListener('focusin', handleFocus, true);
    };
  }, [open, triggerRef, layerRef, cancel]);
}

type SwatchProps = {
  anchorRef: RefObject<HTMLDivElement | null>;
  value: string;
  label: string;
  palette: readonly string[];
  allowAlpha: boolean;
  onChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onPreviewChange: (value: string) => void;
  onPreviewReset: () => void;
};

export function InspectorColorPicker(props: SwatchProps) {
  const ownerId = useId();
  const preferences = usePickerPreferences();
  const state = useColorSelectorState({ ...props, recentColors: undefined });
  const { pickerOpen, layerRef, rootRef } = state;
  const theme = useResolvedPortalTheme(rootRef.current);
  const style = usePickerPlacement(pickerOpen, props.anchorRef, layerRef);
  usePickerFocus(
    pickerOpen && style.visibility !== 'hidden',
    rootRef,
    layerRef,
    state.handlePickerCancel
  );
  const { onOpenChange } = props;
  useEffect(() => onOpenChange(pickerOpen), [onOpenChange, pickerOpen]);

  const finish = (apply: boolean) => {
    if (apply) {
      preferences.rememberColor(state.draftColor);
      state.handlePickerApply();
    } else {
      state.handlePickerCancel();
    }
    rootRef.current?.querySelector('button')?.focus({ preventScroll: true });
  };

  return (
    <div ref={rootRef} {...{ [FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE]: ownerId }}>
      <button
        type="button"
        className="inspector-swatch-trigger"
        aria-label={translate('shared.ui.colorSelectorChooseColor')}
        aria-expanded={pickerOpen}
        style={
          {
            '--inspector-swatch-color': state.draftColor,
            '--inspector-swatch-hover-ink': setColorAlpha(state.draftColor, 1) ?? state.draftColor,
          } as CSSProperties
        }
        onClick={pickerOpen ? state.handlePickerCancel : state.handleOpenPicker}
      >
        <span className="inspector-swatch-color" aria-hidden="true" />
      </button>
      {pickerOpen &&
        createPortal(
          <ColorSelectorFloatingLayer
            layerRef={layerRef}
            ownerId={ownerId}
            portalTheme={theme}
            style={style}
            ui="shared.ui.color-selector.picker-layer"
          >
            <ColorSelectorPickerPopover
              allowAlpha={props.allowAlpha}
              allowTransparent={false}
              catalogMode={preferences.catalogMode}
              onCatalogModeChange={preferences.setCatalogMode}
              color={state.draftColor}
              compact={preferences.compact}
              onToggleCompact={() => preferences.setCompact(!preferences.compact)}
              eyedropper={state.eyedropper}
              formatMode={state.formatMode}
              originalColor={props.value}
              palette={state.normalizedPalette}
              paletteNames={preferences.paletteNames}
              recentColors={preferences.recentColors}
              title={props.label}
              onApply={() => finish(true)}
              onCancel={() => finish(false)}
              onColorChange={(value) =>
                state.handleDraftColorChange(
                  !props.allowAlpha && (getColorAlpha(value) ?? 1) < 1
                    ? (setColorAlpha(value, 1) ?? value)
                    : value
                )
              }
              onCycleFormatMode={state.cycleFormatMode}
              onSelectTransparent={state.handleSelectTransparent}
            />
          </ColorSelectorFloatingLayer>,
          resolveThemeSafePortalTarget(rootRef.current)
        )}
    </div>
  );
}
