import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
const CORNERS: readonly Corner[] = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];
type Drag = {
  pointerId: number;
  handle: HTMLElement;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  moved: boolean;
};

function viewport() {
  return {
    width: document.documentElement.clientWidth || window.innerWidth,
    height: window.innerHeight,
  };
}

function nearestCorner(x: number, y: number): Corner {
  const size = viewport();
  return `${y < size.height / 2 ? 'top' : 'bottom'}-${x < size.width / 2 ? 'left' : 'right'}`;
}

export function useCollapsedPanelDrag(visible: boolean, uiScale: number) {
  const dockRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [corner, setCorner] = useState<Corner>('bottom-right');
  const [draft, setDraft] = useState<{ x: number; y: number; corner: Corner } | null>(null);
  const [size, setSize] = useState(viewport);
  const release = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.handle.hasPointerCapture(drag.pointerId))
      drag.handle.releasePointerCapture(drag.pointerId);
  }, []);
  const cancel = useCallback(() => {
    release();
    setDraft(null);
  }, [release]);
  useEffect(() => {
    const resize = () => {
      cancel();
      setSize(viewport());
    };
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [cancel]);
  useEffect(() => {
    if (!visible) {
      cancel();
      return;
    }
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || !dragRef.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      cancel();
    };
    window.addEventListener('keydown', escape, true);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('keydown', escape, true);
      window.removeEventListener('blur', cancel);
      release();
    };
  }, [cancel, release, visible]);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || dragRef.current) return;
    const bounds = dockRef.current?.getBoundingClientRect();
    if (!bounds) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      handle: event.currentTarget,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - bounds.x,
      offsetY: event.clientY - bounds.y,
      width: bounds.width,
      height: bounds.height,
      moved: false,
    };
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) return;
    event.preventDefault();
    event.stopPropagation();
    drag.moved = true;
    const size = viewport();
    setDraft({
      x: Math.max(0, Math.min(event.clientX - drag.offsetX, size.width - drag.width)),
      y: Math.max(0, Math.min(event.clientY - drag.offsetY, size.height - drag.height)),
      corner: nearestCorner(event.clientX, event.clientY),
    });
  };
  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (drag.moved) setCorner(nearestCorner(event.clientX, event.clientY));
    cancel();
  };
  const advanceCorner = () =>
    setCorner((current) => CORNERS[(CORNERS.indexOf(current) + 1) % CORNERS.length]!);
  const onClick = (event: MouseEvent<HTMLElement>) => {
    if (event.detail !== 0 || dragRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    advanceCorner();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (dragRef.current) return;
    const vertical = corner.startsWith('top') ? 'top' : 'bottom';
    const horizontal = corner.endsWith('left') ? 'left' : 'right';
    const next: Corner | null =
      event.key === 'ArrowLeft'
        ? `${vertical}-left`
        : event.key === 'ArrowRight'
          ? `${vertical}-right`
          : event.key === 'ArrowUp'
            ? `top-${horizontal}`
            : event.key === 'ArrowDown'
              ? `bottom-${horizontal}`
              : null;
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    setCorner(next);
  };
  const top = corner.startsWith('top');
  const left = corner.endsWith('left');
  return {
    dockRef,
    corner,
    activeCorner: draft?.corner ?? null,
    dragging: draft !== null,
    style: draft
      ? { left: draft.x, top: draft.y, transformOrigin: 'top left' }
      : {
          [left ? 'left' : 'right']: 20 * uiScale + (left ? 0 : window.innerWidth - size.width),
          [top ? 'top' : 'bottom']: 20 * uiScale,
          transformOrigin: `${left ? 'left' : 'right'} ${top ? 'top' : 'bottom'}`,
        },
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: cancel,
      onLostPointerCapture: cancel,
      onKeyDown,
      onClick,
    },
  };
}
