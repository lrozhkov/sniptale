import type { Canvas, Control, FabricObject } from 'fabric';
import { EditorCanvas } from '../../../../document/canvas-surface/render-region';
import { DRAWING_SELECTION_ACCENT } from '../../../../drawing/object/controls/chrome';
import type { EditorMagnetManager } from '../../../magnet';
import { isEditorHiddenEdgeControl } from '../../../document/interaction-border-controls';
import { mountSelectionVisibility } from './selection-visibility';
import { mountProjectedSelection } from './projected-selection';
import type { EditorLayerPresentationBounds } from '../../../../document/canvas-surface/render-region';

const SVG_NS = 'http://www.w3.org/2000/svg';
const CORNERS = ['tl', 'tr', 'br', 'bl'];
const mountedChrome = new WeakMap<Canvas, () => void>();
const controlGeometry = new WeakMap<
  Control,
  {
    sizeX: number;
    sizeY: number;
    touchSizeX: number;
    touchSizeY: number;
    offsetX: number;
    offsetY: number;
  }
>();

export function resolveSelectionChromeMetrics(zoom: number) {
  const visualScale = Math.max(0.75, Math.min(1.25, Math.sqrt(zoom)));
  return {
    borderWidth: 1.35,
    cornerRadius: 6.5 * visualScale,
    guideWidth: 1,
    rotationRadius: 9 * visualScale,
  };
}

function svgElement(name: string, attributes: Record<string, string | number>): SVGElement {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

function screenScale(canvas: Canvas): number {
  const width = canvas.getWidth();
  const displayedWidth = canvas.upperCanvasEl.getBoundingClientRect().width;
  return width > 0 && displayedWidth > 0 ? displayedWidth / width : 1;
}

function appendSelectionBorder(
  svg: SVGElement,
  object: FabricObject,
  zoom: number,
  preview = false,
  bounds?: EditorLayerPresentationBounds
): void {
  const corners = bounds
    ? [
        { x: bounds.left, y: bounds.top },
        { x: bounds.left + bounds.width, y: bounds.top },
        { x: bounds.left + bounds.width, y: bounds.top + bounds.height },
        { x: bounds.left, y: bounds.top + bounds.height },
      ]
    : object.getCoords();
  if ((!preview && !bounds && !object.hasBorders) || corners.length !== 4) return;
  const [a, b, c, d, offsetX, offsetY] = object.canvas?.viewportTransform ?? [1, 0, 0, 1, 0, 0];
  svg.appendChild(
    svgElement('polygon', {
      points: corners
        .map(
          (point) => `${point.x * a + point.y * c + offsetX},${point.x * b + point.y * d + offsetY}`
        )
        .join(' '),
      fill: 'none',
      stroke:
        preview || bounds
          ? DRAWING_SELECTION_ACCENT
          : object.borderColor || DRAWING_SELECTION_ACCENT,
      'stroke-width': resolveSelectionChromeMetrics(zoom).borderWidth,
      'stroke-dasharray':
        (preview || bounds ? [4, 3] : object.borderDashArray)
          ?.map((value) => value / zoom)
          .join(' ') ?? '',
      ...(!preview && bounds
        ? {
            'data-ui': 'editor.canvas.projected-selection-outline',
            'data-layer-id': object.sniptaleId ?? '',
          }
        : {}),
      ...(preview
        ? {
            'data-ui': 'editor.canvas.selection-preview-outline',
            'data-layer-id': object.sniptaleId ?? '',
          }
        : {}),
      'vector-effect': 'non-scaling-stroke',
    })
  );
}

function updateControlHitGeometry(
  object: FabricObject,
  zoom: number,
  touchedControls: Set<Control>
): void {
  let hitGeometryChanged = false;
  for (const control of Object.values(object.controls)) {
    let initial = controlGeometry.get(control);
    if (!initial) {
      initial = {
        sizeX: control.sizeX,
        sizeY: control.sizeY,
        touchSizeX: control.touchSizeX,
        touchSizeY: control.touchSizeY,
        offsetX: control.offsetX,
        offsetY: control.offsetY,
      };
      controlGeometry.set(control, initial);
    }
    const sizeX = Math.max(20, initial.sizeX || object.cornerSize) / zoom;
    const sizeY = Math.max(20, initial.sizeY || object.cornerSize) / zoom;
    const touchSizeX = Math.max(28, initial.touchSizeX || 28) / zoom;
    const touchSizeY = Math.max(28, initial.touchSizeY || 28) / zoom;
    const offsetX = initial.offsetX / zoom;
    const offsetY = initial.offsetY / zoom;
    if (
      control.sizeX !== sizeX ||
      control.sizeY !== sizeY ||
      control.touchSizeX !== touchSizeX ||
      control.touchSizeY !== touchSizeY ||
      control.offsetX !== offsetX ||
      control.offsetY !== offsetY
    ) {
      Object.assign(control, { sizeX, sizeY, touchSizeX, touchSizeY, offsetX, offsetY });
      touchedControls.add(control);
      hitGeometryChanged = true;
    }
  }
  if (hitGeometryChanged) object.setCoords();
}

function appendSelectionControl(
  svg: SVGElement,
  object: FabricObject,
  key: string,
  point: { x: number; y: number },
  zoom: number
): void {
  const metrics = resolveSelectionChromeMetrics(zoom);
  const color = object.cornerStrokeColor || object.borderColor || '#2563eb';
  if (key === 'mtr') {
    const icon = svgElement('g', {
      transform: `translate(${point.x} ${point.y}) scale(${metrics.rotationRadius / (9 * zoom)})`,
      opacity: 'var(--editor-selection-controls-opacity, 1)',
      fill: 'none',
      stroke: color,
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
    icon.appendChild(
      svgElement('path', {
        d: [
          'M -9 0 A 9 9 0 0 1 6.364 -6.364 L 9 -4',
          'M 9 -9 L 9 -4 L 4 -4',
          'M 9 0 A 9 9 0 0 1 -6.364 6.364 L -9 4',
          'M -4 4 L -9 4 L -9 9 L -4 4',
        ].join(' '),
      })
    );
    svg.appendChild(icon);
    return;
  }
  const radius = CORNERS.includes(key) ? metrics.cornerRadius : (5.5 * metrics.cornerRadius) / 6.5;
  svg.appendChild(
    svgElement('circle', {
      cx: point.x,
      cy: point.y,
      opacity: 'var(--editor-selection-controls-opacity, 1)',
      r: radius / zoom,
      fill: object.cornerColor || '#fff',
      stroke: color,
      'stroke-width': 1.6,
      'vector-effect': 'non-scaling-stroke',
    })
  );
}

function appendSelection(
  svg: SVGElement,
  object: FabricObject,
  zoom: number,
  touchedControls: Set<Control>
): void {
  appendSelectionBorder(svg, object, zoom);
  if (!object.hasControls) return;
  updateControlHitGeometry(object, zoom, touchedControls);
  const positions = object.calcOCoords();
  for (const key of Object.keys(object.controls)) {
    if (!object.isControlVisible(key) || isEditorHiddenEdgeControl(object.controls[key])) continue;
    const point = positions[key];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    appendSelectionControl(svg, object, key, point, zoom);
  }
}

function appendGuides(svg: SVGElement, magnet: EditorMagnetManager, zoom: number): void {
  const { lines, points } = magnet.getVisualGuides();
  const color = 'rgba(14, 165, 233, 0.88)';
  const appendCross = (point: { x: number; y: number }) => {
    const extent = 4 / zoom;
    const firstDiagonal = `M ${point.x - extent} ${point.y - extent} L ${point.x + extent} ${point.y + extent}`;
    const secondDiagonal = `M ${point.x + extent} ${point.y - extent} L ${point.x - extent} ${point.y + extent}`;
    svg.appendChild(
      svgElement('path', {
        d: `${firstDiagonal} ${secondDiagonal}`,
        fill: 'none',
        stroke: color,
        'stroke-width': 1,
        'vector-effect': 'non-scaling-stroke',
      })
    );
  };
  for (const { origin, target } of lines) {
    svg.appendChild(
      svgElement('line', {
        x1: origin.x,
        y1: origin.y,
        x2: target.x,
        y2: target.y,
        stroke: color,
        'stroke-width': 1,
        'stroke-dasharray': `${4 / zoom} ${4 / zoom}`,
        'vector-effect': 'non-scaling-stroke',
      })
    );
    appendCross(origin);
    appendCross(target);
  }
  for (const point of points) appendCross(point);
}

export function mountEditorSelectionChrome(canvas: Canvas, magnet: EditorMagnetManager): void {
  const container = canvas.upperCanvasEl.parentElement;
  if (!container) return;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('data-ui', 'editor.canvas.selection-chrome');
  svg.setAttribute('aria-hidden', 'true');
  const upperCanvasZIndex = Number(getComputedStyle(canvas.upperCanvasEl).zIndex) || 0;
  Object.assign(svg.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    overflow: 'visible',
    pointerEvents: 'none',
    // The annotation plane is z-30; its surfaces must not cover selection contours.
    zIndex: String(Math.max(31, upperCanvasZIndex + 1)),
  });
  container.appendChild(svg);
  Reflect.set(canvas, 'skipControlsDrawing', true);
  const selection = svgElement('g', {});
  selection.setAttribute('data-ui', 'editor.canvas.selection-controls');
  const disposeVisibility = mountSelectionVisibility(canvas, selection);
  const touchedControls = new Set<Control>();
  let hoverTarget: FabricObject | undefined;
  let previewSuspended = false;
  const render = (event?: { ctx: CanvasRenderingContext2D }) => {
    if (event && event.ctx !== canvas.getContext() && event.ctx !== canvas.contextTop) return;
    const width = canvas.getWidth();
    const height = canvas.getHeight();
    if (width <= 0 || height <= 0) return;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const zoom = screenScale(canvas);
    selection.replaceChildren();
    const activeObject = canvas.getActiveObject();
    if (activeObject) appendSelection(selection, activeObject, zoom, touchedControls);
    for (const object of canvas.getActiveObjects?.() ?? []) {
      const bounds = projected?.resolve(object);
      if (bounds) appendSelectionBorder(selection, object, zoom, false, bounds);
    }
    const guides = svgElement('g', {
      transform: `matrix(${(canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0]).join(' ')})`,
    });
    appendGuides(guides, magnet, zoom * (canvas.viewportTransform?.[0] ?? 1));
    const previews = svgElement('g', { 'data-ui': 'editor.canvas.selection-preview' });
    if (canvas instanceof EditorCanvas && !previewSuspended) {
      for (const object of canvas.getSelectionPreviewObjects(hoverTarget)) {
        const bounds = projected?.resolve(object);
        if (bounds !== null) appendSelectionBorder(previews, object, zoom, true, bounds);
      }
    }
    svg.replaceChildren(previews, selection, guides);
  };
  const updateHover = (object?: FabricObject) => {
    if (object === hoverTarget && !previewSuspended) return;
    previewSuspended = false;
    hoverTarget = object;
    render();
  };
  const projected =
    canvas instanceof EditorCanvas ? mountProjectedSelection(canvas, render, updateHover) : null;
  const clearPreview = () => {
    hoverTarget = undefined;
    render();
  };
  const blurPreview = () => {
    previewSuspended = true;
    clearPreview();
  };
  const previewSubscriptions =
    canvas instanceof EditorCanvas
      ? [
          canvas.on('mouse:move', ({ e, target }) => {
            const next = 'buttons' in e && e.buttons === 0 ? target : undefined;
            if (next === hoverTarget && !previewSuspended) return;
            previewSuspended = false;
            hoverTarget = next;
            render();
          }),
          canvas.on('mouse:out', clearPreview),
          canvas.on('mouse:down', clearPreview),
          canvas.on('mouse:up', clearPreview),
        ]
      : [];
  window.addEventListener('blur', blurPreview);
  const unsubscribe = canvas.on('after:render', render);
  mountedChrome.set(canvas, () => {
    disposeVisibility();
    projected?.dispose();
    for (const unsubscribePreview of previewSubscriptions) unsubscribePreview();
    window.removeEventListener('blur', blurPreview);
    unsubscribe();
    svg.remove();
    for (const control of touchedControls) {
      const initial = controlGeometry.get(control);
      if (initial) Object.assign(control, initial);
    }
    Reflect.set(canvas, 'skipControlsDrawing', false);
  });
  render();
}

export function disposeEditorSelectionChrome(canvas: Canvas): void {
  mountedChrome.get(canvas)?.();
  mountedChrome.delete(canvas);
}
