import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { translate } from '../../platform/i18n';

export function updatePlaneFromEvent(
  event: PointerEvent | ReactPointerEvent<HTMLDivElement>,
  element: HTMLDivElement,
  hue: number,
  getColorFromPlanePoint: (args: {
    hue: number;
    left: number;
    top: number;
    width: number;
    height: number;
  }) => string
) {
  const bounds = element.getBoundingClientRect();
  return getColorFromPlanePoint({
    hue,
    left: Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)),
    top: Math.max(0, Math.min(bounds.height, event.clientY - bounds.top)),
    width: Math.max(bounds.width, 1),
    height: Math.max(bounds.height, 1),
  });
}

type ColorPlaneProps = {
  getColorFromPlanePoint: (args: {
    hue: number;
    left: number;
    top: number;
    width: number;
    height: number;
  }) => string;
  hue: number;
  onSelectionChange: (selection: { saturation: number; value: number }) => void;
  planeColor: string;
  planeRef: MutableRefObject<HTMLDivElement | null>;
  saturation: number;
  value: number;
};

function getPlaneSelectionFromEvent(
  event: PointerEvent | ReactPointerEvent<HTMLDivElement>,
  element: HTMLDivElement
) {
  const bounds = element.getBoundingClientRect();
  const width = Math.max(bounds.width, 1);
  const height = Math.max(bounds.height, 1);
  const left = Math.max(0, Math.min(width, event.clientX - bounds.left));
  const top = Math.max(0, Math.min(height, event.clientY - bounds.top));

  return {
    saturation: left / width,
    value: 1 - top / height,
  };
}

function releasePlanePointer(
  element: HTMLDivElement | null,
  activePointerIdRef: MutableRefObject<number | null>,
  pointerId: number
) {
  if (activePointerIdRef.current !== pointerId) {
    return;
  }

  if (element?.hasPointerCapture(pointerId)) {
    element.releasePointerCapture(pointerId);
  }

  activePointerIdRef.current = null;
}

function usePlaneSelection(props: ColorPlaneProps, planeElement: HTMLDivElement | null) {
  return useCallback(
    (event: PointerEvent | ReactPointerEvent<HTMLDivElement>) => {
      if (!planeElement) {
        return;
      }

      props.onSelectionChange(getPlaneSelectionFromEvent(event, planeElement));
    },
    [planeElement, props]
  );
}

function usePlanePointerLifecycle(
  planeElement: HTMLDivElement | null,
  activePointerIdRef: MutableRefObject<number | null>,
  updatePlaneSelection: (event: PointerEvent) => void,
  restoreCursor: () => void
) {
  const updateRef = useRef(updatePlaneSelection);
  updateRef.current = updatePlaneSelection;
  useEffect(() => {
    if (!planeElement) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (activePointerIdRef.current === event.pointerId) {
        updateRef.current(event);
      }
    };
    const handlePointerRelease = (event: PointerEvent) => {
      if (activePointerIdRef.current !== event.pointerId) return;
      releasePlanePointer(planeElement, activePointerIdRef, event.pointerId);
      restoreCursor();
    };
    const handleLostPointerCapture = () => {
      activePointerIdRef.current = null;
      restoreCursor();
    };
    const cancel = () => {
      if (activePointerIdRef.current !== null)
        releasePlanePointer(planeElement, activePointerIdRef, activePointerIdRef.current);
      restoreCursor();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel();
    };
    const view = planeElement.ownerDocument.defaultView;
    view?.addEventListener('blur', cancel);
    view?.addEventListener('keydown', escape);

    planeElement.addEventListener('pointermove', handlePointerMove);
    planeElement.addEventListener('pointerup', handlePointerRelease);
    planeElement.addEventListener('pointercancel', handlePointerRelease);
    planeElement.addEventListener('lostpointercapture', handleLostPointerCapture);
    return () => {
      cancel();
      view?.removeEventListener('blur', cancel);
      view?.removeEventListener('keydown', escape);
      planeElement.removeEventListener('pointermove', handlePointerMove);
      planeElement.removeEventListener('pointerup', handlePointerRelease);
      planeElement.removeEventListener('pointercancel', handlePointerRelease);
      planeElement.removeEventListener('lostpointercapture', handleLostPointerCapture);
    };
  }, [activePointerIdRef, planeElement, restoreCursor]);
}

function usePlaneInteractions(props: ColorPlaneProps) {
  const activePointerIdRef = useRef<number | null>(null);
  const cursorStyles = useRef<HTMLStyleElement[]>([]);
  const restoreCursor = useCallback(() => {
    cursorStyles.current.forEach((style) => style.remove());
    cursorStyles.current = [];
  }, []);
  const [planeElement, setPlaneElement] = useState<HTMLDivElement | null>(null);
  const updatePlaneSelection = usePlaneSelection(props, planeElement);
  const assignPlaneRef = useCallback(
    (node: HTMLDivElement | null) => {
      props.planeRef.current = node;
      setPlaneElement(node);
    },
    [props.planeRef]
  );
  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!planeElement || event.button !== 0) {
        return;
      }

      event.preventDefault();
      restoreCursor();
      const style = planeElement.ownerDocument.createElement('style');
      style.textContent = 'html,html *{cursor:none!important}';
      planeElement.ownerDocument.head.append(style);
      cursorStyles.current = [style];
      const root = planeElement.getRootNode();
      if (root instanceof ShadowRoot) {
        const shadowStyle = planeElement.ownerDocument.createElement('style');
        shadowStyle.textContent = '*{cursor:none!important}';
        root.append(shadowStyle);
        cursorStyles.current.push(shadowStyle);
      }
      activePointerIdRef.current = event.pointerId;
      planeElement.setPointerCapture(event.pointerId);
      updatePlaneSelection(event);
    },
    [planeElement, updatePlaneSelection, restoreCursor]
  );
  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 0.1 : 0.01;
      const selection = { saturation: props.saturation, value: props.value };
      switch (event.key) {
        case 'ArrowLeft':
          selection.saturation = Math.max(0, selection.saturation - step);
          break;
        case 'ArrowRight':
          selection.saturation = Math.min(1, selection.saturation + step);
          break;
        case 'ArrowDown':
          selection.value = Math.max(0, selection.value - step);
          break;
        case 'ArrowUp':
          selection.value = Math.min(1, selection.value + step);
          break;
        case 'Home':
          selection.saturation = 0;
          break;
        case 'End':
          selection.saturation = 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      props.onSelectionChange(selection);
    },
    [props]
  );

  usePlanePointerLifecycle(planeElement, activePointerIdRef, updatePlaneSelection, restoreCursor);
  return { assignPlaneRef, handleKeyDown, handlePointerDown };
}

export function ColorPlane(props: ColorPlaneProps) {
  const interactions = usePlaneInteractions(props);

  return (
    <div
      ref={interactions.assignPlaneRef}
      role="slider"
      aria-label={translate('shared.ui.colorSelectorChooseColor')}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={Math.round(props.value * 100)}
      aria-valuetext={`${Math.round(props.saturation * 100)}%, ${Math.round(props.value * 100)}%`}
      tabIndex={0}
      onKeyDown={interactions.handleKeyDown}
      onPointerDown={interactions.handlePointerDown}
      className={[
        'sniptale-color-plane relative h-[154px] rounded-[4px]',
        'touch-none cursor-crosshair',
        'focus-visible:outline-1 focus-visible:outline-offset-2',
        'focus-visible:outline-[var(--sniptale-color-text-secondary)]',
      ].join(' ')}
      style={{ backgroundColor: props.planeColor }}
    >
      <div className="absolute inset-0 rounded-[3px] bg-[linear-gradient(90deg,#fff,transparent)]" />
      <div className="absolute inset-0 rounded-[3px] bg-[linear-gradient(0deg,#000,transparent)]" />
      <div
        data-ui="shared.ui.color-selector.plane-marker"
        aria-hidden="true"
        className="sniptale-color-plane-ring pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
        style={{ left: `${props.saturation * 100}%`, top: `${(1 - props.value) * 100}%` }}
      />
    </div>
  );
}
