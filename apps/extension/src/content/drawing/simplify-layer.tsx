import { LoaderCircle } from 'lucide-react';
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { DrawingPoint, DrawingSimplifyObject } from '../../features/drawing/public';
import type { ContentDrawingController } from './controller';
import { translate } from '../../platform/i18n';
import { getContentSimplifyRasterBounds, getContentSimplifyMaskCorners } from './simplify-object';

function showPrimitiveFill(root: ShadowRoot, source: CanvasImageSource): void {
  const fill = document.createElement('canvas');
  fill.width = 1;
  fill.height = 1;
  fill.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none;';
  try {
    const context = fill.getContext('2d');
    if (!context) {
      root.replaceChildren();
      return;
    }
    context.drawImage(source, 0, 0, 1, 1, 0, 0, 1, 1);
    root.replaceChildren(fill);
  } catch {
    root.replaceChildren();
  }
}

/** Keeps raster nodes and URLs inside a native isolated-world closed shadow tree. */
export function DrawingSimplifyLayer(props: {
  object: DrawingSimplifyObject;
  projection: DrawingPoint;
  viewportOrigin?: DrawingPoint;
  opacity?: number;
  previewFill?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [paintedResult, setPaintedResult] = useState<DrawingSimplifyObject['result']>();
  const privateRoot = useRef<ShadowRoot | null>(null);
  useLayoutEffect(() => {
    if (!host.current) return;
    const root = privateRoot.current ?? host.current.attachShadow({ mode: 'closed' });
    privateRoot.current = root;
    const result = props.object.result;
    if (!result) {
      root.replaceChildren();
      return;
    }
    const manualImage =
      !props.object.settings.automatic && props.object.settings.manualKind === 'image';
    if (manualImage) {
      const previous = root.firstElementChild;
      if (previous instanceof HTMLImageElement || previous instanceof HTMLCanvasElement)
        showPrimitiveFill(root, previous);
      else root.replaceChildren();
    }
    let current = true;
    const image = new Image();
    image.alt = '';
    image.draggable = false;
    image.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none;';
    image.onload = () => {
      if (!current) return;
      if (props.previewFill) {
        showPrimitiveFill(root, image);
        setPaintedResult(result);
        return;
      }
      root.replaceChildren(image);
      setPaintedResult(result);
      if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
        image.animate?.([{ filter: 'blur(2px)' }, { filter: 'blur(0px)' }], { duration: 150 });
    };
    image.src = result.dataUrl;
    return () => {
      current = false;
      image.onload = null;
    };
  }, [
    props.object.result,
    props.object.settings.automatic,
    props.object.settings.manualKind,
    props.previewFill,
  ]);
  const mask = props.object.settings.automatic;
  const bounds = getContentSimplifyRasterBounds(props.object);
  const polygon = mask
    ? getContentSimplifyMaskCorners(props.object)
        .map((point) => `${point.x - bounds.x}px ${point.y - bounds.y}px`)
        .join(', ')
    : null;
  return (
    <div
      ref={host}
      data-ui="content.drawing.simplify-private"
      data-simplify-pending={!props.object.result ? 'true' : undefined}
      aria-hidden="true"
      style={{
        position: props.viewportOrigin ? 'absolute' : 'fixed',
        pointerEvents: 'none',
        ...(!props.object.result
          ? { border: '1px dashed #2563eb', boxSizing: 'border-box' as const }
          : {}),
        left: bounds.x - props.projection.x - (props.viewportOrigin?.x ?? 0),
        top: bounds.y - props.projection.y - (props.viewportOrigin?.y ?? 0),
        width: bounds.width,
        height: bounds.height,
        transform: mask ? 'none' : `rotate(${props.object.rotation ?? 0}deg)`,
        ...(polygon ? { clipPath: `polygon(${polygon})` } : {}),
        ...(!props.object.result || props.object.result !== paintedResult
          ? { backdropFilter: 'blur(2px)' }
          : {}),
        transformOrigin: 'center',
        opacity: props.opacity ?? 1,
      }}
    />
  );
}
const noSubscribe = () => () => undefined;
const zero = () => 0;

/** Exposes operation feedback without exposing source or result pixels to the open UI tree. */
export function DrawingSimplifyFeedback(props: {
  controller: ContentDrawingController;
  projection: DrawingPoint;
}) {
  const runtime = props.controller.simplify;
  useSyncExternalStore(
    runtime?.subscribe ?? noSubscribe,
    runtime?.getRevision ?? zero,
    runtime?.getRevision ?? zero
  );
  const feedback = runtime?.getFeedback();
  const key =
    feedback === 'too-small'
      ? 'content.toolbar.drawingSimplifyTooSmall'
      : feedback === 'no-source'
        ? 'content.toolbar.drawingSimplifyNoSource'
        : 'content.toolbar.drawingSimplifyFailed';
  return (
    <>
      {runtime?.getPending().map(({ object, updating }) => (
        <div
          key={object.id}
          role="status"
          data-ui="content.drawing.simplify-pending"
          style={{
            position: 'fixed',
            pointerEvents: 'none',
            left: object.bounds.x - props.projection.x,
            top: object.bounds.y - props.projection.y,
            width: object.bounds.width,
            height: object.bounds.height,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2147483646,
          }}
        >
          <span
            style={{
              color: 'var(--sniptale-color-text-primary)',
              background: 'var(--sniptale-color-surface-panel)',
              borderRadius: 4,
              padding: '4px 8px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <LoaderCircle aria-hidden size={16} className="motion-safe:animate-spin" />
            {translate(
              updating
                ? 'content.toolbar.drawingSimplifyUpdating'
                : 'content.toolbar.drawingSimplifyWorking'
            )}
          </span>
        </div>
      ))}
      {feedback ? (
        <div
          role="status"
          data-ui="content.drawing.simplify-feedback"
          style={{
            position: 'fixed',
            left: 16,
            bottom: 16,
            pointerEvents: 'none',
            zIndex: 2147483646,
            color: 'var(--sniptale-color-text-primary)',
            background: 'var(--sniptale-color-surface-panel)',
            padding: '8px 12px',
            borderRadius: 4,
          }}
        >
          {translate(key)}
        </div>
      ) : null}
    </>
  );
}
