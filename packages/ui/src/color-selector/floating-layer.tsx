import {
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  bindFloatingInteractionPositionListeners,
  mergeFloatingInteractionLayerStyle,
} from '../floating-interactions/placement';

const COLOR_SELECTOR_LAYER_WIDTH = 224;
const COLOR_SELECTOR_LAYER_GAP = 8;
const COLOR_SELECTOR_VIEWPORT_PADDING = 8;

function resolveColorSelectorLayerStyle(anchor: HTMLElement | null): CSSProperties {
  if (!anchor || typeof window === 'undefined') {
    return { width: COLOR_SELECTOR_LAYER_WIDTH };
  }

  const rect = anchor.getBoundingClientRect();
  const viewportWidth = window.innerWidth || rect.right + COLOR_SELECTOR_VIEWPORT_PADDING;
  const viewportHeight = window.innerHeight || rect.bottom + COLOR_SELECTOR_VIEWPORT_PADDING;
  const belowRoom = viewportHeight - rect.bottom - COLOR_SELECTOR_VIEWPORT_PADDING;
  const aboveRoom = rect.top - COLOR_SELECTOR_VIEWPORT_PADDING;
  const placeAbove = belowRoom < 260 && aboveRoom > belowRoom;
  const maxHeight = Math.max(
    180,
    Math.min(420, (placeAbove ? aboveRoom : belowRoom) - COLOR_SELECTOR_LAYER_GAP)
  );
  const left = Math.min(
    Math.max(rect.right - COLOR_SELECTOR_LAYER_WIDTH, COLOR_SELECTOR_VIEWPORT_PADDING),
    Math.max(
      COLOR_SELECTOR_VIEWPORT_PADDING,
      viewportWidth - COLOR_SELECTOR_VIEWPORT_PADDING - COLOR_SELECTOR_LAYER_WIDTH
    )
  );

  return {
    left,
    maxHeight,
    top: placeAbove ? rect.top - COLOR_SELECTOR_LAYER_GAP : rect.bottom + COLOR_SELECTOR_LAYER_GAP,
    transform: placeAbove ? 'translateY(-100%)' : undefined,
    width: COLOR_SELECTOR_LAYER_WIDTH,
  };
}

export function useColorSelectorLayerStyle(anchor: HTMLElement | null, open: boolean) {
  const [style, setStyle] = useState<CSSProperties>(() => resolveColorSelectorLayerStyle(anchor));
  const updateStyle = useCallback(() => {
    setStyle(resolveColorSelectorLayerStyle(anchor));
  }, [anchor]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    return bindFloatingInteractionPositionListeners(anchor, updateStyle);
  }, [anchor, open, updateStyle]);

  return style;
}

export function ColorSelectorFloatingLayer(props: {
  children: ReactNode;
  layerRef: RefObject<HTMLDivElement | null>;
  portalTheme: string | null;
  style: CSSProperties;
  ui: string;
}) {
  const floatingPanelClassName =
    'fixed z-[2147483647] overflow-x-visible overflow-y-auto overscroll-contain';
  const stopLayerEventPropagation = (
    event: PointerEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>
  ) => {
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
  };

  return (
    <div
      ref={props.layerRef}
      className={floatingPanelClassName}
      data-theme={props.portalTheme ?? undefined}
      data-floating-ui-root="true"
      data-ui={props.ui}
      onPointerDown={stopLayerEventPropagation}
      onMouseDown={stopLayerEventPropagation}
      onClick={stopLayerEventPropagation}
      style={mergeFloatingInteractionLayerStyle(props.style)}
    >
      {props.children}
    </div>
  );
}
