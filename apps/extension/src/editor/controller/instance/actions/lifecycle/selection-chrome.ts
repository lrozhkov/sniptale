import { FabricObject, Group, IText, type Canvas, type Control } from 'fabric';
import { resolveDrawingAlignmentFeedback } from '../../../../../features/drawing/public';
import { readCanvasChromeColors } from '../../../../../ui/drawing-tools/selection-chrome';
import { EditorCanvas } from '../../../../document/canvas-surface/render-region';
import {
  CANVAS_SELECTION_METRICS,
  CANVAS_ROTATE_DOT_PATH,
  getCanvasHandleSize,
} from '../../../../../ui/drawing-tools/selection-chrome';
import { isDrawingControlCaptured } from '../../../../drawing/object/controls/chrome';
import { readEditorDrawingObject } from '../../../../drawing/object/metadata';
import { getRichShapeSelectionGeometry } from '../../../document/objects/rich-shape-controls';
import { isEditorHiddenEdgeControl } from '../../../document/interaction-border-controls';
import { readFrameAnnotationSnapshot } from '../../../../frame-annotation/proxy';
import type { EditorMagnetManager } from '../../../magnet';
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
    shouldActivate: Control['shouldActivate'];
  }
>();

export function resolveSelectionChromeMetrics(_zoom: number) {
  return {
    borderWidth: CANVAS_SELECTION_METRICS.border,
    cornerRadius: CANVAS_SELECTION_METRICS.corner / 2,
    guideWidth: 1,
    rotationRadius: CANVAS_SELECTION_METRICS.rotation / 2,
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
  bounds?: EditorLayerPresentationBounds,
  parentContext = false,
  layerPreview = false
): void {
  const drawing = readEditorDrawingObject(object);
  const richGeometry = getRichShapeSelectionGeometry(object);
  if (
    !layerPreview &&
    !bounds &&
    (richGeometry === 'line' ||
      drawing?.kind === 'arrow' ||
      (!preview &&
        (richGeometry === 'rectangle' ||
          drawing?.kind === 'rectangle' ||
          (object.sniptaleType === 'shape' && object.type === 'rect') ||
          (object.sniptaleType === 'frame-annotation' &&
            !readFrameAnnotationSnapshot(object)?.annotationKind))))
  )
    return;
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
      stroke: parentContext
        ? 'var(--sniptale-color-text-muted, #64748b)'
        : preview || bounds
          ? 'var(--sniptale-color-canvas-selection, #2563eb)'
          : object.sniptaleLocked
            ? 'var(--sniptale-color-text-muted, #64748b)'
            : 'var(--sniptale-color-canvas-selection, #2563eb)',
      'stroke-width': resolveSelectionChromeMetrics(zoom).borderWidth,
      'stroke-dasharray':
        (parentContext ? [4, 3] : preview || bounds ? [] : object.borderDashArray)
          ?.map((value) => value / zoom)
          .join(' ') ?? '',
      ...(parentContext ? { 'data-ui': 'editor.canvas.parent-group-context' } : {}),
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
        shouldActivate: control.shouldActivate,
      };
      controlGeometry.set(control, initial);
      touchedControls.add(control);
      const activate = control.shouldActivate;
      control.shouldActivate = function (key, target, pointer, corners) {
        if (!activate.call(this, key, target, pointer, corners)) return false;
        const positions = target.calcOCoords();
        let candidates = Object.keys(target.controls).filter(
          (candidate) => target.isControlVisible(candidate) && positions[candidate]
        );
        if (target instanceof FabricObject && target.sniptaleType === 'arrow') {
          const existingPoints = candidates.filter(
            (candidate) =>
              /^(start|end|bend-\d+)$/.test(candidate) &&
              Math.hypot(
                pointer.x - positions[candidate]!.x,
                pointer.y - positions[candidate]!.y
              ) <= 14
          );
          if (existingPoints.length) candidates = existingPoints;
        }
        candidates.sort((a, b) => {
          const first = positions[a]!,
            second = positions[b]!;
          return (
            Math.hypot(pointer.x - first.x, pointer.y - first.y) -
              Math.hypot(pointer.x - second.x, pointer.y - second.y) ||
            Number(!CORNERS.includes(a)) - Number(!CORNERS.includes(b)) ||
            a.localeCompare(b)
          );
        });
        const nearestKey = candidates[0];
        if (nearestKey !== key) return false;
        if (CORNERS.includes(key) || ['mt', 'mr', 'mb', 'ml', 'start', 'end'].includes(key)) {
          const position = positions[key]!;
          const center = target.getCenterPoint().transform(target.getViewportTransform());
          if (
            Math.hypot(pointer.x - center.x, pointer.y - center.y) <
            Math.hypot(pointer.x - position.x, pointer.y - position.y)
          )
            return false;
        }
        return true;
      };
    }
    const sizeX = Math.max(CANVAS_SELECTION_METRICS.hit, initial.sizeX || object.cornerSize) / zoom;
    const sizeY = Math.max(CANVAS_SELECTION_METRICS.hit, initial.sizeY || object.cornerSize) / zoom;
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
  if (key === 'bend-insert') return;
  const color =
    object.sniptaleRole === 'crop-guide'
      ? object.cornerStrokeColor || object.borderColor
      : 'var(--sniptale-color-canvas-selection, #2563eb)';
  const readyPoint =
    key !== 'bend-insert' &&
    (readEditorDrawingObject(object)?.kind === 'arrow' ||
      getRichShapeSelectionGeometry(object) === 'line');
  const active =
    isDrawingControlCaptured(object, key) ||
    (!object.canvas?._currentTransform && readyPoint && object.__corner === key);
  if (key === 'mtr') {
    const scale = CANVAS_SELECTION_METRICS.rotation / (24 * zoom);
    const icon = svgElement('path', {
      d: CANVAS_ROTATE_DOT_PATH,
      transform: `translate(${point.x} ${point.y}) scale(${scale}) translate(-12 -12)`,
      'data-ui': 'editor.canvas.selection-rotate',
      'data-control': key,
      opacity: 'var(--editor-selection-controls-opacity, 1)',
      fill: 'none',
      stroke: color,
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
    svg.appendChild(icon);
    return;
  }
  const kind = CORNERS.includes(key)
    ? 'corner'
    : key === 'ml' || key === 'mr'
      ? 'vertical'
      : key === 'mt' || key === 'mb'
        ? 'horizontal'
        : 'point';
  const size = getCanvasHandleSize(kind);
  svg.appendChild(
    svgElement(kind === 'point' ? 'circle' : 'rect', {
      ...(kind === 'point'
        ? { cx: point.x, cy: point.y, r: size.width / (2 * zoom) }
        : {
            x: point.x - size.width / (2 * zoom),
            y: point.y - size.height / (2 * zoom),
            width: size.width / zoom,
            height: size.height / zoom,
            rx: (kind === 'corner' ? 1.5 : 3) / zoom,
            transform: `rotate(${object.getTotalAngle?.() ?? 0} ${point.x} ${point.y})`,
          }),
      'data-ui': 'editor.canvas.selection-handle',
      'data-control': key,
      opacity: 'var(--editor-selection-controls-opacity, 1)',
      fill: active ? color : '#fff',
      stroke: color,
      'stroke-width': 1.25,
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
  if (object instanceof IText && object.isEditing) return;
  if (object.canvas instanceof EditorCanvas) {
    const parent = object.canvas.getSelectionGroupScope();
    if (parent && parent !== object)
      appendSelectionBorder(svg, parent, zoom, false, undefined, true);
  }
  appendSelectionBorder(svg, object, zoom);
  if (!object.hasControls) return;
  updateControlHitGeometry(object, zoom, touchedControls);
  const positions = object.calcOCoords();
  for (const key of Object.keys(object.controls)) {
    if (
      !object.isControlVisible(key) ||
      (object.sniptaleRole === 'crop-guide' && isEditorHiddenEdgeControl(object.controls[key]))
    )
      continue;
    const point = positions[key];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    appendSelectionControl(svg, object, key, point, zoom);
  }
}

function appendGuides(
  svg: SVGElement,
  accepted: ReturnType<EditorMagnetManager['getVisualFeedback']>,
  zoom: number
): void {
  const feedback = resolveDrawingAlignmentFeedback(accepted.guides, zoom, accepted.relations);
  const color = 'var(--sniptale-color-canvas-magnet, #9854d8)';
  for (const line of feedback.lines)
    svg.appendChild(
      svgElement('line', {
        x1: line.axis === 'x' ? line.coordinate : line.from,
        y1: line.axis === 'y' ? line.coordinate : line.from,
        x2: line.axis === 'x' ? line.coordinate : line.to,
        y2: line.axis === 'y' ? line.coordinate : line.to,
        stroke: color,
        'stroke-width': 1,
        'stroke-dasharray': `${4 / zoom} ${3 / zoom}`,
        'data-ui': 'editor.canvas.magnet-guide',
        'data-axis': line.axis,
        'vector-effect': 'non-scaling-stroke',
      })
    );
  for (const measurement of feedback.measurements) {
    const group = svgElement('g', {
      'data-ui': 'editor.canvas.magnet-relation',
      'data-relation-kind': measurement.kind,
      'data-relation-axis': measurement.axis,
      'data-relation-key': measurement.key,
      'data-value': measurement.value,
    });
    for (const points of measurement.segments)
      group.appendChild(
        svgElement('polyline', {
          points: points.map((point) => `${point.x},${point.y}`).join(' '),
          fill: 'none',
          stroke: color,
          'stroke-width': 1,
          'vector-effect': 'non-scaling-stroke',
        })
      );
    if (measurement.label) {
      const label = svgElement('text', {
        x: measurement.label.point.x,
        y: measurement.label.point.y,
        'text-anchor': measurement.label.anchor,
        'font-size': 10 / zoom,
        'font-family': 'ui-monospace, SFMono-Regular, monospace',
        fill: color,
        stroke: 'var(--sniptale-color-surface-panel, #fff)',
        'stroke-width': 3,
        'stroke-linejoin': 'round',
        'paint-order': 'stroke',
        'vector-effect': 'non-scaling-stroke',
      });
      label.textContent = measurement.label.text;
      group.appendChild(label);
    }
    svg.appendChild(group);
  }
  for (const marker of feedback.markers) {
    const r = 4 / zoom;
    const vertices = [
      `M ${marker.x} ${marker.y - r}`,
      `L ${marker.x + r} ${marker.y}`,
      `L ${marker.x} ${marker.y + r}`,
      `L ${marker.x - r} ${marker.y} Z`,
    ];
    svg.appendChild(
      svgElement('path', {
        d: vertices.join(' '),
        fill: marker.filled ? color : 'none',
        stroke: color,
        'stroke-width': 1.2,
        'data-ui': 'editor.canvas.magnet-marker',
        'data-filled': marker.filled ? 'true' : 'false',
        'vector-effect': 'non-scaling-stroke',
      })
    );
  }
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
  const originalMarquee = {
    selectionColor: canvas.selectionColor,
    selectionBorderColor: canvas.selectionBorderColor,
    selectionLineWidth: canvas.selectionLineWidth,
    selectionDashArray: canvas.selectionDashArray,
  };
  const colors = readCanvasChromeColors(canvas.upperCanvasEl);
  canvas.selectionColor = `color-mix(in srgb, ${colors.selection} 8%, transparent)`;
  canvas.selectionBorderColor = colors.selection;
  canvas.selectionLineWidth = CANVAS_SELECTION_METRICS.border;
  canvas.selectionDashArray = [];
  Reflect.set(canvas, 'skipControlsDrawing', true);
  const selection = svgElement('g', {});
  selection.setAttribute('data-ui', 'editor.canvas.selection-controls');
  const disposeVisibility = mountSelectionVisibility(canvas, selection);
  const touchedControls = new Set<Control>();
  let hoverTarget: FabricObject | undefined;
  let previewSuspended = false;
  let layerHoverTarget: FabricObject | undefined;
  const render = (event?: { ctx: CanvasRenderingContext2D }) => {
    if (event && event.ctx !== canvas.getContext() && event.ctx !== canvas.contextTop) return;
    const width = canvas.getWidth();
    const height = canvas.getHeight();
    if (width <= 0 || height <= 0) return;
    const activeObject = canvas.getActiveObject();
    const activeObjects = canvas.getActiveObjects?.() ?? [];
    const candidates =
      canvas instanceof EditorCanvas && !previewSuspended
        ? layerHoverTarget && layerHoverTarget.visible && !activeObjects.includes(layerHoverTarget)
          ? [layerHoverTarget]
          : canvas.getSelectionPreviewObjects(hoverTarget)
        : [];
    const accepted = magnet.getVisualFeedback();
    if (
      !activeObject &&
      !activeObjects.length &&
      !candidates.length &&
      !accepted.guides.length &&
      !accepted.relations.length
    ) {
      if (selection.childNodes.length) selection.replaceChildren();
      if (svg.childNodes.length !== 1 || svg.firstChild !== selection)
        svg.replaceChildren(selection);
      return;
    }
    // Read layout before SVG writes; empty freehand chrome must not invalidate layout.
    const zoom = screenScale(canvas);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    selection.replaceChildren();
    if (activeObject) appendSelection(selection, activeObject, zoom, touchedControls);
    for (const object of activeObjects) {
      const bounds = projected?.resolve(object);
      if (bounds) appendSelectionBorder(selection, object, zoom, false, bounds);
    }
    const guides = svgElement('g', {
      transform: `matrix(${(canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0]).join(' ')})`,
    });
    appendGuides(guides, accepted, zoom * (canvas.viewportTransform?.[0] ?? 1));
    const previews = svgElement('g', { 'data-ui': 'editor.canvas.selection-preview' });
    if (canvas instanceof EditorCanvas && !previewSuspended) {
      for (const object of candidates) {
        const bounds = projected?.resolve(object);
        if (bounds !== null)
          appendSelectionBorder(
            previews,
            object,
            zoom,
            true,
            bounds,
            false,
            object === layerHoverTarget
          );
      }
    }
    svg.replaceChildren(previews, guides, selection);
  };
  const updateHover = (object?: FabricObject) => {
    if (object === hoverTarget && !previewSuspended) return;
    previewSuspended = false;
    hoverTarget = object;
    render();
  };
  let layerHovering = false;
  const layerHover = (event: PointerEvent) => {
    if (event.buttons !== 0) return;
    const marker =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-editor-layer-id]')
        : null;
    if (!marker) {
      if (layerHovering) {
        layerHovering = false;
        clearPreview();
      }
      return;
    }
    const find = (objects: FabricObject[]): FabricObject | undefined => {
      for (const object of objects) {
        if (object.sniptaleId === marker.dataset['editorLayerId']) return object;
        const nested = object instanceof Group ? find(object.getObjects()) : undefined;
        if (nested) return nested;
      }
      return undefined;
    };
    layerHovering = true;
    const next = find(canvas.getObjects());
    if (next !== layerHoverTarget) {
      layerHoverTarget = next;
      previewSuspended = false;
      render();
    }
  };
  canvas.upperCanvasEl.ownerDocument.addEventListener('pointermove', layerHover);
  const projected =
    canvas instanceof EditorCanvas ? mountProjectedSelection(canvas, render, updateHover) : null;
  const clearPreview = () => {
    hoverTarget = undefined;
    layerHoverTarget = undefined;
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
            layerHoverTarget = undefined;
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
    canvas.upperCanvasEl.ownerDocument.removeEventListener('pointermove', layerHover);
    Object.assign(canvas, originalMarquee);
    projected?.dispose();
    for (const unsubscribePreview of previewSubscriptions) unsubscribePreview();
    window.removeEventListener('blur', blurPreview);
    unsubscribe();
    svg.remove();
    for (const control of touchedControls) {
      const initial = controlGeometry.get(control);
      if (initial) Object.assign(control, initial);
      controlGeometry.delete(control);
    }
    Reflect.set(canvas, 'skipControlsDrawing', false);
  });
  render();
}

export function disposeEditorSelectionChrome(canvas: Canvas): void {
  mountedChrome.get(canvas)?.();
  mountedChrome.delete(canvas);
}
