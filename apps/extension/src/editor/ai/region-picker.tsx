import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import { translate } from '../../platform/i18n';
import { EditorIconButton } from '../chrome/ui';
import type { ImageApplyController, ImageBounds } from '../controller/ai-image/types';

type Point = { x: number; y: number };

/** Selects document coordinates without entering a document editing tool. */
export function ImageRegionPicker(props: {
  controller: ImageApplyController;
  onSelect(region: ImageBounds): void;
  onCancel(): void;
}) {
  const canvas = props.controller.canvas;
  const element = canvas?.upperCanvasEl;
  const theme = useResolvedPortalTheme(element ?? null);
  const [bounds, setBounds] = useState<DOMRect | null>(null);
  const [drag, setDrag] = useState<{ start: Point; end: Point } | null>(null);
  const { onCancel } = props;
  useLayoutEffect(() => {
    if (element) setBounds(element.getBoundingClientRect());
  }, [element]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    };
    document.addEventListener('keydown', escape, true);
    window.addEventListener('resize', onCancel);
    const scroll = (event: Event) => {
      if (
        event.target === document ||
        (event.target instanceof Element && event.target.contains(element ?? null))
      ) {
        if (element) setBounds(element.getBoundingClientRect());
        setDrag(null);
      }
    };
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('resize', onCancel);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [onCancel, element]);
  if (!canvas || !element || !bounds) return null;
  const point = (event: PointerEvent): Point => {
    const scene = canvas.getScenePoint(event);
    return {
      x: Math.max(0, Math.min(props.controller.canvasDocumentSize.width, scene.x)),
      y: Math.max(0, Math.min(props.controller.canvasDocumentSize.height, scene.y)),
    };
  };
  const screen = (point: Point): Point => {
    const v = canvas.viewportTransform;
    return {
      x: ((v[0] * point.x + v[2] * point.y + v[4]) * bounds.width) / canvas.getWidth(),
      y: ((v[1] * point.x + v[3] * point.y + v[5]) * bounds.height) / canvas.getHeight(),
    };
  };
  const start = drag && screen(drag.start);
  const end = drag && screen(drag.end);
  return createPortal(
    <div
      data-ui="editor.ai.region-picker"
      data-theme={theme ?? undefined}
      role="region"
      aria-label={translate('editor.ai.selectRegion')}
      className="fixed z-20 touch-none cursor-crosshair overflow-hidden"
      style={{ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }}
      onPointerDown={(event) => {
        if (
          event.button !== 0 ||
          (event.target instanceof Element && event.target.closest('button'))
        )
          return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const start = point(event.nativeEvent);
        setDrag({ start, end: start });
      }}
      onPointerMove={(event) => {
        if (drag) setDrag({ start: drag.start, end: point(event.nativeEvent) });
      }}
      onPointerUp={(event) => {
        if (!drag) return;
        const end = point(event.nativeEvent);
        const left = Math.floor(Math.min(drag.start.x, end.x));
        const top = Math.floor(Math.min(drag.start.y, end.y));
        const width = Math.ceil(Math.max(drag.start.x, end.x)) - left;
        const height = Math.ceil(Math.max(drag.start.y, end.y)) - top;
        setDrag(null);
        if (width > 0 && height > 0) props.onSelect({ left, top, width, height });
      }}
      onPointerCancel={onCancel}
    >
      <ImageRegionGuide start={start} end={end} onCancel={onCancel} />
    </div>,
    resolveThemeSafePortalTarget(element)
  );
}

function ImageRegionGuide(props: { start: Point | null; end: Point | null; onCancel(): void }) {
  return (
    <>
      <div
        className={[
          'fixed left-1/2 top-20 flex -translate-x-1/2 items-center gap-2 rounded px-3 py-1 text-xs',
          'bg-[var(--sniptale-color-surface-panel)] text-[var(--sniptale-color-text-primary)]',
        ].join(' ')}
      >
        {translate('editor.ai.drawRegion')}
        <EditorIconButton title={translate('common.actions.close')} onClick={props.onCancel}>
          <X size={14} />
        </EditorIconButton>
      </div>
      {props.start && props.end ? (
        <div
          className={[
            'pointer-events-none absolute border border-[var(--sniptale-color-accent)]',
            'bg-[var(--sniptale-color-accent-soft)]/20',
          ].join(' ')}
          style={{
            left: Math.min(props.start.x, props.end.x),
            top: Math.min(props.start.y, props.end.y),
            width: Math.abs(props.end.x - props.start.x),
            height: Math.abs(props.end.y - props.start.y),
          }}
        />
      ) : null}
    </>
  );
}
