import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type React from 'react';
import { hasLayerReorderChanged, projectLayerDropOrder } from './drop';
import type { EditorLayerItem } from '../../../features/editor/document/types';

type Session = {
  id: string;
  ids: string[];
  pointerId: number;
  startX: number;
  startY: number;
  clientY: number;
  active: boolean;
  order: string[];
  root: HTMLElement;
};

export function useLayerPointerReorder(props: {
  layers: EditorLayerItem[];
  onMove: (ids: readonly string[], beforeId: string | null) => void;
  setDraggedLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  setDragOverLayerId: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  const latest = useRef(props);
  const session = useRef<Session | null>(null);
  const [preview, setPreview] = useState<{ id: string; ids: string[]; order: string[] } | null>(
    null
  );
  const suppressClick = useRef(false);
  const clear = useCallback(() => {
    session.current = null;
    setPreview(null);
    document.documentElement.removeAttribute('data-editor-layer-dragging');
    latest.current.setDraggedLayerId(null);
    latest.current.setDragOverLayerId(null);
  }, []);
  useLayoutEffect(() => {
    const before = latest.current.layers;
    latest.current = props;
    const current = session.current;
    if (current && hasLayerReorderChanged(before, props.layers)) clear();
  });

  useEffect(() => {
    let frame = 0;
    const project = (current: Session) => {
      const rows = Array.from(
        current.root.querySelectorAll<HTMLElement>('[data-layer-reorder-row]')
      ).filter((row) => !current.ids.includes(row.dataset['layerReorderRow'] ?? ''));
      const before = rows.find((row) => {
        const bounds = row.getBoundingClientRect();
        return current.clientY < bounds.top + bounds.height / 2;
      });
      const order = projectLayerDropOrder(
        latest.current.layers,
        current.order,
        current.ids,
        before?.dataset['layerReorderRow'] ?? null
      );
      if (order.some((id, position) => id !== current.order[position])) {
        current.order = order;
        setPreview({ id: current.id, ids: current.ids, order });
      }
    };
    const scroll = () => {
      const current = session.current;
      if (!current?.active) return;
      const bounds = current.root.getBoundingClientRect();
      const edge = 24;
      const delta =
        current.clientY < bounds.top + edge ? -8 : current.clientY > bounds.bottom - edge ? 8 : 0;
      if (delta) {
        current.root.scrollTop += delta;
        project(current);
      }
      frame = requestAnimationFrame(scroll);
    };
    const move = (event: PointerEvent) => {
      const current = session.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (!current.active) {
        if (Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 4) return;
        current.active = true;
        suppressClick.current = true;
        document.documentElement.setAttribute('data-editor-layer-dragging', '');
        latest.current.setDraggedLayerId(current.id);
        setPreview({ id: current.id, ids: current.ids, order: current.order });
        frame = requestAnimationFrame(scroll);
      }
      event.preventDefault();
      current.clientY = event.clientY;
      project(current);
    };
    const cancel = () => {
      cancelAnimationFrame(frame);
      clear();
    };
    const end = (event: PointerEvent) => {
      const current = session.current;
      if (!current || current.pointerId !== event.pointerId) return;
      try {
        if (current.active) {
          const last = Math.max(...current.ids.map((id) => current.order.indexOf(id)));
          if (current.order.some((id, index) => id !== latest.current.layers[index]?.id))
            latest.current.onMove(current.ids, current.order[last + 1] ?? null);
        }
      } finally {
        cancel();
      }
    };
    const pointerCancel = (event: PointerEvent) => {
      if (session.current?.pointerId === event.pointerId) cancel();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && session.current) {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    };
    const click = (event: MouseEvent) => {
      if (!suppressClick.current) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    };
    const resetClick = () => {
      if (!session.current) suppressClick.current = false;
    };
    window.addEventListener('pointerdown', resetClick, true);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', pointerCancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', key, true);
    window.addEventListener('click', click, true);
    return () => {
      cancelAnimationFrame(frame);
      document.documentElement.removeAttribute('data-editor-layer-dragging');
      session.current = null;
      window.removeEventListener('pointerdown', resetClick, true);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', pointerCancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('click', click, true);
    };
  }, [clear]);

  const start = useCallback((id: string, event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || event.isPrimary === false || session.current) return;
    const root = event.currentTarget.closest<HTMLElement>(
      '[data-ui="editor.layers.list-viewport"]'
    );
    const layer = latest.current.layers.find((item) => item.id === id);
    if (!root || !layer?.selected || (!layer.reorderable && (layer.immutable || layer.locked)))
      return;
    event.preventDefault();
    event.stopPropagation();
    const moving = latest.current.layers.filter((item) => item.selected);
    if (moving.some((item) => !item.reorderable && (item.immutable || item.locked))) return;
    suppressClick.current = false;
    session.current = {
      id,
      ids: moving.map((item) => item.id),
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      clientY: event.clientY,
      active: false,
      order: latest.current.layers.map((item) => item.id),
      root,
    };
  }, []);
  const byId = new Map(props.layers.map((layer) => [layer.id, layer]));
  return {
    start,
    draggingId: preview?.id ?? null,
    draggingIds: preview?.ids ?? [],
    layers: preview
      ? preview.order.flatMap((id) => {
          const layer = byId.get(id);
          return layer ? [layer] : [];
        })
      : props.layers,
  };
}
