import { Point, util, type Canvas } from 'fabric';
import type { DrawingSimplifyObject, DrawingSimplifySource } from '../../features/drawing/public';
import { translate } from '../../platform/i18n';
import { sampleEditorSimplifyRegion } from './object/simplify';

function createPendingBadge(label: string): HTMLElement {
  const spinner = document.createElement('span');
  spinner.setAttribute('aria-hidden', 'true');
  spinner.className = 'animate-spin motion-reduce:animate-none';
  Object.assign(spinner.style, {
    width: '16px',
    height: '16px',
    flexShrink: '0',
    border: '2px solid currentColor',
    borderTopColor: 'transparent',
    borderRadius: '50%',
  });
  const badge = document.createElement('span');
  Object.assign(badge.style, {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    borderRadius: '4px',
    padding: '4px 8px',
    background: 'var(--sniptale-color-surface-panel)',
  });
  badge.append(spinner, document.createTextNode(label));
  return badge;
}

export function pendingPresentation(
  canvas: Canvas,
  drawing: DrawingSimplifyObject,
  onDisposed: () => void = () => undefined
): {
  cleanup: () => void;
  complete: () => void;
  show: (dataUrl: string, source: DrawingSimplifySource) => void;
} {
  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'status');
  const label = translate(
    drawing.result
      ? 'content.toolbar.drawingSimplifyUpdating'
      : 'content.toolbar.drawingSimplifyWorking'
  );
  overlay.setAttribute('aria-label', label);
  overlay.dataset['ui'] = 'editor.simplify.pending';
  Object.assign(overlay.style, {
    position: 'absolute',
    pointerEvents: 'none',
    display: 'grid',
    placeItems: 'center',
    backdropFilter: 'blur(2px)',
    overflow: 'hidden',
    color: 'var(--sniptale-color-text-primary)',
    zIndex: String(Number(getComputedStyle(canvas.upperCanvasEl).zIndex) || 0),
  });
  overlay.append(createPendingBadge(label));
  canvas.wrapperEl.append(overlay);
  const update = () => {
    const center = util.transformPoint(
      new Point(
        drawing.bounds.x + drawing.bounds.width / 2,
        drawing.bounds.y + drawing.bounds.height / 2
      ),
      canvas.viewportTransform
    );
    const zoom = canvas.getZoom();
    Object.assign(overlay.style, {
      left: `${center.x - (drawing.bounds.width * zoom) / 2}px`,
      top: `${center.y - (drawing.bounds.height * zoom) / 2}px`,
      width: `${drawing.bounds.width * zoom}px`,
      height: `${drawing.bounds.height * zoom}px`,
      transform: `rotate(${drawing.rotation ?? 0}deg)`,
    });
  };
  const stop = canvas.on('after:render', ({ ctx }) => {
    // Backdrop capture renders with a temporary source projection.
    if (ctx === canvas.getContext()) update();
  });
  update();
  let live = true;
  let animation: Animation | null = null;
  const cleanup = () => {
    if (!live) return;
    live = false;
    stop();
    animation?.cancel();
    overlay.remove();
    onDisposed();
  };
  return {
    cleanup,
    complete: () => {
      if (!live) return;
      stop();
      overlay.replaceChildren();
      overlay.removeAttribute('role');
      if (
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
        typeof overlay.animate !== 'function'
      ) {
        cleanup();
        return;
      }
      animation = overlay.animate(
        [{ backdropFilter: 'blur(2px)' }, { backdropFilter: 'blur(0px)' }],
        { duration: 150, easing: 'ease-out', fill: 'forwards' }
      );
      animation.onfinish = cleanup;
      animation.oncancel = cleanup;
    },
    show: (dataUrl, source) => {
      const image = document.createElement('img');
      Object.assign(image.style, {
        position: 'absolute',
        left: '0',
        top: '0',
        width: '100%',
        height: '100%',
        maxWidth: 'none',
        opacity: '0',
      });
      if (drawing.settings.automatic) {
        const region = sampleEditorSimplifyRegion(drawing, source).bounds;
        const center = {
          x: drawing.bounds.x + drawing.bounds.width / 2,
          y: drawing.bounds.y + drawing.bounds.height / 2,
        };
        Object.assign(image.style, {
          position: 'absolute',
          width: `${(region.width / drawing.bounds.width) * 100}%`,
          height: `${(region.height / drawing.bounds.height) * 100}%`,
          left: `${((region.x - drawing.bounds.x) / drawing.bounds.width) * 100}%`,
          top: `${((region.y - drawing.bounds.y) / drawing.bounds.height) * 100}%`,
          transform: `rotate(${-(drawing.rotation ?? 0)}deg)`,
          transformOrigin: [
            `${((center.x - region.x) / region.width) * 100}%`,
            `${((center.y - region.y) / region.height) * 100}%`,
          ].join(' '),
        });
      }
      image.onload = () => {
        if (!live) return;
        image.style.opacity = '1';
        overlay.replaceChildren(image);
        overlay.style.backdropFilter = 'none';
      };
      overlay.append(image);
      image.src = dataUrl;
    },
  };
}
