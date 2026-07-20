import { DEFAULT_COLOR_DANGER } from '@sniptale/ui/default-colors/constants';

const VIDEO_ANNOTATION_STROKE = DEFAULT_COLOR_DANGER;

function generateAnnotationId(): string {
  return `annotation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function createVideoAnnotationsOverlay(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 2147483646;
  `;

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', 'arrowhead');
  marker.setAttribute('markerWidth', '10');
  marker.setAttribute('markerHeight', '10');
  marker.setAttribute('refX', '9');
  marker.setAttribute('refY', '3');
  marker.setAttribute('orient', 'auto');
  marker.setAttribute('markerUnits', 'strokeWidth');

  const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  polygon.setAttribute('points', '0 0, 10 3, 0 6');
  polygon.setAttribute('fill', VIDEO_ANNOTATION_STROKE);

  marker.appendChild(polygon);
  defs.appendChild(marker);
  svg.appendChild(defs);
  return svg;
}

export function createAnnotationRectangle(
  x: number,
  y: number,
  width: number,
  height: number
): SVGRectElement {
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', Math.min(x, x + width).toString());
  rect.setAttribute('y', Math.min(y, y + height).toString());
  rect.setAttribute('width', Math.abs(width).toString());
  rect.setAttribute('height', Math.abs(height).toString());
  rect.setAttribute('stroke', VIDEO_ANNOTATION_STROKE);
  rect.setAttribute('stroke-width', '4');
  rect.setAttribute('fill', 'none');
  rect.setAttribute('data-annotation-id', generateAnnotationId());
  rect.setAttribute('data-created-at', Date.now().toString());
  return rect;
}

export function createAnnotationArrow(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): SVGLineElement {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', x1.toString());
  line.setAttribute('y1', y1.toString());
  line.setAttribute('x2', x2.toString());
  line.setAttribute('y2', y2.toString());
  line.setAttribute('stroke', VIDEO_ANNOTATION_STROKE);
  line.setAttribute('stroke-width', '4');
  line.setAttribute('marker-end', 'url(#arrowhead)');
  line.setAttribute('data-annotation-id', generateAnnotationId());
  line.setAttribute('data-created-at', Date.now().toString());
  return line;
}

export function createAnnotationPath(points: Array<{ x: number; y: number }>): SVGPathElement {
  if (points.length < 2) {
    throw new Error('Need at least 2 points for path');
  }

  let pathData = '';
  if (points.length === 2) {
    const start = points[0];
    const end = points[1];
    if (!start || !end) {
      throw new Error('Need at least 2 points for path');
    }

    pathData = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  } else {
    const start = points[0];
    if (!start) {
      throw new Error('Need at least 2 points for path');
    }

    pathData = `M ${start.x} ${start.y}`;
    for (let index = 0; index < points.length - 1; index += 1) {
      const p1 = points[index];
      const p2 = points[index + 1];
      if (!p1 || !p2) {
        continue;
      }

      const p0 = points[Math.max(0, index - 1)] ?? p1;
      const p3 = points[Math.min(points.length - 1, index + 2)] ?? p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      pathData += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
  }

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathData);
  path.setAttribute('stroke', VIDEO_ANNOTATION_STROKE);
  path.setAttribute('stroke-width', '4');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('data-annotation-id', generateAnnotationId());
  path.setAttribute('data-created-at', Date.now().toString());
  return path;
}
