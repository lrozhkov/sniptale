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
const COLOR_SELECTOR_LAYER_GAP = 10;
const COLOR_SELECTOR_VIEWPORT_PADDING = 8;

type ColorSelectorFloatingPlacement = 'auto' | 'side';

function projectElementRect(anchor: HTMLElement, uiScale: number) {
  const clientRect = anchor.getBoundingClientRect();
  return {
    clientRect,
    rect: projectClientRectToContentUi(
      {
        x: clientRect.left,
        y: clientRect.top,
        width: clientRect.width,
        height: clientRect.height,
      },
      uiScale
    ),
  };
}

function resolveSideLayerStyle(args: {
  anchorRect: { x: number; y: number; width: number; height: number };
  boundaryRect: { x: number; y: number; width: number; height: number };
  uiScale: number;
  viewportHeight: number;
  viewportWidth: number;
}): CSSProperties | null {
  const boundaryRight = args.boundaryRect.x + args.boundaryRect.width;
  const rightRoom = args.viewportWidth - boundaryRight - COLOR_SELECTOR_VIEWPORT_PADDING;
  const leftRoom = args.boundaryRect.x - COLOR_SELECTOR_VIEWPORT_PADDING;
  const requiredRoom = COLOR_SELECTOR_LAYER_WIDTH + COLOR_SELECTOR_LAYER_GAP;
  if (Math.max(leftRoom, rightRoom) < requiredRoom) return null;

  const placeRight =
    rightRoom >= requiredRoom && (leftRoom < requiredRoom || rightRoom >= leftRoom);
  const maxHeight = Math.max(180, args.viewportHeight - COLOR_SELECTOR_VIEWPORT_PADDING * 2);
  const top = Math.min(
    Math.max(args.anchorRect.y, COLOR_SELECTOR_VIEWPORT_PADDING),
    Math.max(
      COLOR_SELECTOR_VIEWPORT_PADDING,
      args.viewportHeight - COLOR_SELECTOR_VIEWPORT_PADDING - 420
    )
  );
  const clientPosition = projectContentUiPointToClient(
    {
      x: placeRight
        ? boundaryRight + COLOR_SELECTOR_LAYER_GAP
        : args.boundaryRect.x - COLOR_SELECTOR_LAYER_GAP,
      y: top,
    },
    args.uiScale
  );
  return {
    left: clientPosition.x,
    maxHeight,
    top: clientPosition.y,
    transform: placeRight ? undefined : 'translateX(-100%)',
    width: COLOR_SELECTOR_LAYER_WIDTH,
  };
}

function resolveColorSelectorLayerStyle(
  anchor: HTMLElement | null,
  placement: ColorSelectorFloatingPlacement,
  boundary: HTMLElement | null
): CSSProperties {
  if (!anchor || typeof window === 'undefined') {
    return { width: COLOR_SELECTOR_LAYER_WIDTH };
  }

  const uiScale = readContentUiScaleCompensation(anchor);
  const { clientRect, rect } = projectElementRect(anchor, uiScale);
  const boundaryRect = boundary ? projectElementRect(boundary, uiScale).rect : rect;
  const right = rect.x + rect.width;
  const viewport = resolveContentUiViewport({
    clientHeight: window.innerHeight || clientRect.bottom + COLOR_SELECTOR_VIEWPORT_PADDING,
    clientWidth: window.innerWidth || clientRect.right + COLOR_SELECTOR_VIEWPORT_PADDING,
    scale: uiScale,
  });
  const viewportWidth = viewport.width;
  const viewportHeight = viewport.height;
  if (placement === 'side') {
    const sideStyle = resolveSideLayerStyle({
      anchorRect: rect,
      boundaryRect,
      uiScale,
      viewportHeight,
      viewportWidth,
    });
    if (sideStyle) return sideStyle;
  }
  const boundaryBottom = boundaryRect.y + boundaryRect.height;
  const belowRoom = viewportHeight - boundaryBottom - COLOR_SELECTOR_VIEWPORT_PADDING;
  const aboveRoom = boundaryRect.y - COLOR_SELECTOR_VIEWPORT_PADDING;
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
      y: placeAbove
        ? boundaryRect.y - COLOR_SELECTOR_LAYER_GAP
        : boundaryBottom + COLOR_SELECTOR_LAYER_GAP,
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

export function useColorSelectorLayerStyle(
  anchor: HTMLElement | null,
  open: boolean,
  placement: ColorSelectorFloatingPlacement = 'auto',
  boundary: HTMLElement | null = null
) {
  const [style, setStyle] = useState<CSSProperties>(() =>
    resolveColorSelectorLayerStyle(anchor, placement, boundary)
  );
  const updateStyle = useCallback(() => {
    setStyle(resolveColorSelectorLayerStyle(anchor, placement, boundary));
  }, [anchor, boundary, placement]);

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
