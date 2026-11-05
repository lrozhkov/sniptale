import { Point, util, type Canvas } from 'fabric';
import type { DrawingSimplifyObject, DrawingSimplifySource } from '../../features/drawing/public';
import { translate } from '../../platform/i18n';
import { sampleEditorSimplifyRegion } from './object/simplify';

export function pendingPresentation(
  canvas: Canvas,
  drawing: DrawingSimplifyObject
): { cleanup: () => void; show: (dataUrl: string, source: DrawingSimplifySource) => void } {
  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'status');
  overlay.setAttribute(
    'aria-label',
    translate(
      drawing.result
        ? 'content.toolbar.drawingSimplifyUpdating'
        : 'content.toolbar.drawingSimplifyWorking'
    )
  );
  overlay.dataset['ui'] = 'editor.simplify.pending';
  Object.assign(overlay.style, {
    position: 'absolute',
    pointerEvents: 'none',
    display: 'grid',
    placeItems: 'center',
    backdropFilter: 'blur(2px)',
    overflow: 'hidden',
    color: 'var(--sniptale-color-info)',
    zIndex: '4',
  });
  const spinner = document.createElement('span');
  spinner.setAttribute('aria-hidden', 'true');
  spinner.className = 'animate-spin motion-reduce:animate-none';
  Object.assign(spinner.style, {
    width: 'min(24px,80%)',
    height: 'min(24px,80%)',
    border: '2px solid currentColor',
    borderTopColor: 'transparent',
    borderRadius: '50%',
  });
  overlay.append(spinner);
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
  const stop = canvas.on('after:render', update);
  update();
  return {
    cleanup: () => {
      stop();
      overlay.remove();
    },
    show: (dataUrl, source) => {
      overlay.style.backdropFilter = 'none';
      const image = document.createElement('img');
      image.src = dataUrl;
      Object.assign(image.style, { width: '100%', height: '100%', maxWidth: 'none' });
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
      overlay.replaceChildren(image);
    },
  };
}
