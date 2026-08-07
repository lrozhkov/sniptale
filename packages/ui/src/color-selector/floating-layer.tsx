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
import {
  FLOATING_INTERACTION_CAPTURE_TRANSIENT_ATTRIBUTE,
  FLOATING_INTERACTION_OWNED_BY_ATTRIBUTE,
} from '../floating-interactions/ownership';
import { useFloatingSurfaceWheelContainment } from '../floating-interactions/wheel';
import {
  projectClientRectToContentUi,
  projectContentUiPointToClient,
  readContentUiScaleCompensation,
  resolveContentUiViewport,
} from '../floating-interactions/scale';

const COLOR_SELECTOR_LAYER_WIDTH = 224;
const COLOR_SELECTOR_LAYER_GAP = 8;
const COLOR_SELECTOR_VIEWPORT_PADDING = 8;

function resolveColorSelectorLayerStyle(anchor: HTMLElement | null): CSSProperties {
  if (!anchor || typeof window === 'undefined') {
    return { width: COLOR_SELECTOR_LAYER_WIDTH };
  }

  const uiScale = readContentUiScaleCompensation(anchor);
  const clientRect = anchor.getBoundingClientRect();
  const rect = projectClientRectToContentUi(
    {
      x: clientRect.left,
      y: clientRect.top,
      width: clientRect.width,
      height: clientRect.height,
    },
    uiScale
  );
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const viewport = resolveContentUiViewport({
    clientHeight: window.innerHeight || clientRect.bottom + COLOR_SELECTOR_VIEWPORT_PADDING,
    clientWidth: window.innerWidth || clientRect.right + COLOR_SELECTOR_VIEWPORT_PADDING,
    scale: uiScale,
  });
  const viewportWidth = viewport.width;
  const viewportHeight = viewport.height;
  const belowRoom = viewportHeight - bottom - COLOR_SELECTOR_VIEWPORT_PADDING;
  const aboveRoom = rect.y - COLOR_SELECTOR_VIEWPORT_PADDING;
  const placeAbove = belowRoom < 260 && aboveRoom > belowRoom;
  const maxHeight = Math.max(
    180,
    Math.min(420, (placeAbove ? aboveRoom : belowRoom) - COLOR_SELECTOR_LAYER_GAP)
  );
  const left = Math.min(
    Math.max(right - COLOR_SELECTOR_LAYER_WIDTH, COLOR_SELECTOR_VIEWPORT_PADDING),
    Math.max(
      COLOR_SELECTOR_VIEWPORT_PADDING,
      viewportWidth - COLOR_SELECTOR_VIEWPORT_PADDING - COLOR_SELECTOR_LAYER_WIDTH
    )
  );

  const clientPosition = projectContentUiPointToClient(
    {
      x: left,
      y: placeAbove ? rect.y - COLOR_SELECTOR_LAYER_GAP : bottom + COLOR_SELECTOR_LAYER_GAP,
    },
    uiScale
  );
  return {
    left: clientPosition.x,
    maxHeight,
    top: clientPosition.y,
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
  ownerId: string;
  portalTheme: string | null;
  style: CSSProperties;
  ui: string;
}) {
  const layerRef = useFloatingSurfaceWheelContainment(props.layerRef);
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
      ref={layerRef}
      className={floatingPanelClassName}
      data-theme={props.portalTheme ?? undefined}
      data-floating-ui-root="true"
      {...{ [FLOATING_INTERACTION_CAPTURE_TRANSIENT_ATTRIBUTE]: 'true' }}
      {...{ [FLOATING_INTERACTION_OWNED_BY_ATTRIBUTE]: props.ownerId }}
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
