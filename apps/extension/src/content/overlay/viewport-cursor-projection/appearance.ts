const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const CURSOR_SIZE_CSS_PX = 24;

export type ProjectedCursorKind =
  | 'copy'
  | 'crosshair'
  | 'default'
  | 'ew-resize'
  | 'grab'
  | 'grabbing'
  | 'help'
  | 'hidden'
  | 'move'
  | 'nesw-resize'
  | 'not-allowed'
  | 'ns-resize'
  | 'nwse-resize'
  | 'pointer'
  | 'progress'
  | 'text'
  | 'vertical-text'
  | 'wait'
  | 'zoom-in'
  | 'zoom-out';

type CursorShape = {
  d: string;
  fill?: string;
  linecap?: 'butt' | 'round' | 'square';
  linejoin?: 'bevel' | 'miter' | 'round';
  stroke?: string;
  strokeWidth?: number;
};

type CursorGlyphDescriptor = {
  hotspot: { x: number; y: number };
  shapes: readonly CursorShape[];
};

const outlinedArrow: CursorShape = {
  d: 'M1.2 1.1V18.4L6 14.1L9.6 22.1L13.3 20.3L9.7 12.7H16.5Z',
  fill: '#fff',
  linejoin: 'round',
  stroke: '#050505',
  strokeWidth: 1.45,
};

const outlinedHand: CursorShape = {
  d: [
    'M7.1 11.4V3.8C7.1 2.8 7.8 2 8.8 2C9.8 2 10.5 2.8 10.5 3.8V8.2V6.7',
    'C10.5 5.8 11.2 5.1 12.1 5.1C13 5.1 13.7 5.8 13.7 6.7V8.3V7.3',
    'C13.7 6.4 14.4 5.8 15.3 5.8C16.2 5.8 16.9 6.5 16.9 7.4V9V8.4',
    'C16.9 7.5 17.6 6.9 18.5 6.9C19.4 6.9 20.1 7.6 20.1 8.5V13.5',
    'C20.1 18.7 17.4 22 12.7 22C9.7 22 7.8 20.3 6.5 18.3L3.7 14.2',
    'C3.1 13.3 3.4 12.1 4.4 11.6C5.2 11.2 6.1 11.4 7.1 12.7Z',
  ].join(''),
  fill: '#fff',
  linecap: 'round',
  linejoin: 'round',
  stroke: '#050505',
  strokeWidth: 1.35,
};

const outlinedGrabbingHand: CursorShape = {
  ...outlinedHand,
  d: [
    'M6.4 12V7.2C6.4 6.2 7.1 5.5 8.1 5.5C9 5.5 9.7 6.2 9.7 7.2V9V5.5',
    'C9.7 4.5 10.4 3.8 11.4 3.8C12.3 3.8 13 4.5 13 5.5V8.8V6.3',
    'C13 5.4 13.7 4.7 14.6 4.7C15.5 4.7 16.2 5.4 16.2 6.3V9V7.6',
    'C16.2 6.7 16.9 6 17.8 6C18.7 6 19.4 6.7 19.4 7.6V13.8',
    'C19.4 18.8 16.7 22 12.2 22C9.4 22 7.4 20.2 6.1 18.2L3.8 14.6',
    'C3.2 13.6 3.5 12.4 4.5 11.9C5.2 11.5 5.8 11.6 6.4 12Z',
  ].join(''),
};

const whiteGuide = (d: string): CursorShape => ({
  d,
  fill: 'none',
  linecap: 'round',
  linejoin: 'round',
  stroke: '#fff',
  strokeWidth: 4,
});

const blackGuide = (d: string): CursorShape => ({
  d,
  fill: 'none',
  linecap: 'round',
  linejoin: 'round',
  stroke: '#050505',
  strokeWidth: 1.5,
});

const guideGlyph = (d: string): readonly CursorShape[] => [whiteGuide(d), blackGuide(d)];

const helpPath = [
  'M17 14.5C17 12.8 18 12 19.4 12C20.8 12 22 12.9 22 14.3',
  'C22 15.4 21.4 16 20.3 16.7C19.4 17.2 19 17.8 19 18.6M19 21H19.1',
].join('');

const movePath = [
  'M12 2V22M2 12H22M12 2L8.5 5.5M12 2L15.5 5.5',
  'M12 22L8.5 18.5M12 22L15.5 18.5M2 12L5.5 8.5M2 12L5.5 15.5',
  'M22 12L18.5 8.5M22 12L18.5 15.5',
].join('');

const cursorGlyphs: Record<Exclude<ProjectedCursorKind, 'hidden'>, CursorGlyphDescriptor> = {
  copy: {
    hotspot: { x: 1, y: 1 },
    shapes: [
      outlinedArrow,
      { d: 'M14 14H22V22H14Z', fill: '#fff', stroke: '#050505', strokeWidth: 1.2 },
      blackGuide('M18 15.8V20.2M15.8 18H20.2'),
    ],
  },
  crosshair: {
    hotspot: { x: 12, y: 12 },
    shapes: guideGlyph('M12 2V22M2 12H22M12 9.5V14.5M9.5 12H14.5'),
  },
  default: { hotspot: { x: 1, y: 1 }, shapes: [outlinedArrow] },
  'ew-resize': {
    hotspot: { x: 12, y: 12 },
    shapes: guideGlyph('M2 12H22M2 12L6 8M2 12L6 16M22 12L18 8M22 12L18 16'),
  },
  grab: { hotspot: { x: 12, y: 10 }, shapes: [outlinedHand] },
  grabbing: { hotspot: { x: 12, y: 10 }, shapes: [outlinedGrabbingHand] },
  help: {
    hotspot: { x: 1, y: 1 },
    shapes: [outlinedArrow, whiteGuide(helpPath), blackGuide(helpPath)],
  },
  move: {
    hotspot: { x: 12, y: 12 },
    shapes: guideGlyph(movePath),
  },
  'nesw-resize': {
    hotspot: { x: 12, y: 12 },
    shapes: guideGlyph('M4 20L20 4M4 20V14M4 20H10M20 4H14M20 4V10'),
  },
  'not-allowed': {
    hotspot: { x: 1, y: 1 },
    shapes: [
      { ...outlinedArrow, d: 'M1.2 1.1V15.5L5.2 12L8 18L11 16.6L8.1 10.7H14Z' },
      {
        d: 'M13.5 13.5A5 5 0 1 0 20.5 20.5A5 5 0 0 0 13.5 13.5ZM14.8 14.8L19.2 19.2',
        fill: '#fff',
        linecap: 'round',
        stroke: '#050505',
        strokeWidth: 1.5,
      },
    ],
  },
  'ns-resize': {
    hotspot: { x: 12, y: 12 },
    shapes: guideGlyph('M12 2V22M12 2L8 6M12 2L16 6M12 22L8 18M12 22L16 18'),
  },
  'nwse-resize': {
    hotspot: { x: 12, y: 12 },
    shapes: guideGlyph('M4 4L20 20M4 4V10M4 4H10M20 20H14M20 20V14'),
  },
  pointer: { hotspot: { x: 8, y: 2 }, shapes: [outlinedHand] },
  progress: {
    hotspot: { x: 1, y: 1 },
    shapes: [
      { ...outlinedArrow, d: 'M1.2 1.1V16L5.4 12.3L8.5 19L11.8 17.4L8.7 10.8H15Z' },
      blackGuide('M20.5 15.5A4.5 4.5 0 1 1 16.2 12'),
    ],
  },
  text: {
    hotspot: { x: 12, y: 12 },
    shapes: guideGlyph('M8 3H16M12 3V21M8 21H16'),
  },
  'vertical-text': {
    hotspot: { x: 12, y: 12 },
    shapes: guideGlyph('M3 8V16M3 12H21M21 8V16'),
  },
  wait: {
    hotspot: { x: 12, y: 12 },
    shapes: [whiteGuide('M12 3A9 9 0 1 1 5.6 5.6'), blackGuide('M12 3A9 9 0 1 1 5.6 5.6')],
  },
  'zoom-in': {
    hotspot: { x: 9, y: 9 },
    shapes: guideGlyph('M3 10A7 7 0 1 0 17 10A7 7 0 0 0 3 10M15 15L22 22M7 10H13M10 7V13'),
  },
  'zoom-out': {
    hotspot: { x: 9, y: 9 },
    shapes: guideGlyph('M3 10A7 7 0 1 0 17 10A7 7 0 0 0 3 10M15 15L22 22M7 10H13'),
  },
};

const cursorAliases: Readonly<Record<string, ProjectedCursorKind>> = {
  alias: 'copy',
  'all-scroll': 'move',
  auto: 'default',
  cell: 'crosshair',
  'col-resize': 'ew-resize',
  'context-menu': 'default',
  copy: 'copy',
  crosshair: 'crosshair',
  default: 'default',
  'e-resize': 'ew-resize',
  'ew-resize': 'ew-resize',
  grab: 'grab',
  grabbing: 'grabbing',
  help: 'help',
  move: 'move',
  'n-resize': 'ns-resize',
  'ne-resize': 'nesw-resize',
  'nesw-resize': 'nesw-resize',
  'no-drop': 'not-allowed',
  none: 'hidden',
  'not-allowed': 'not-allowed',
  'ns-resize': 'ns-resize',
  'nw-resize': 'nwse-resize',
  'nwse-resize': 'nwse-resize',
  pointer: 'pointer',
  progress: 'progress',
  'row-resize': 'ns-resize',
  's-resize': 'ns-resize',
  'se-resize': 'nwse-resize',
  'sw-resize': 'nesw-resize',
  text: 'text',
  'vertical-text': 'vertical-text',
  'w-resize': 'ew-resize',
  wait: 'wait',
  'zoom-in': 'zoom-in',
  'zoom-out': 'zoom-out',
};

const textControlSelector = [
  'input:not([type="button"]):not([type="checkbox"]):not([type="color"])',
  ':not([type="file"]):not([type="image"]):not([type="radio"])',
  ':not([type="range"]):not([type="reset"]):not([type="submit"])',
  ', textarea, [contenteditable=""], [contenteditable="true"]',
].join('');

function resolveAutoCursor(target: Element | null, userSelect: string): ProjectedCursorKind {
  if (!target) return 'default';
  if (target.closest('a[href], area[href]')) return 'pointer';
  if (target.closest(textControlSelector)) {
    return 'text';
  }
  if (target.closest('button, select, summary, [role="button"]')) return 'default';
  return userSelect !== 'none' && target.textContent?.trim() ? 'text' : 'default';
}

export function resolveProjectedCursorKind(
  cursorValue: string,
  target: Element | null,
  userSelect: string
): ProjectedCursorKind {
  const fallbackKeyword = cursorValue.split(',').at(-1)?.trim().toLowerCase() ?? 'auto';
  const semanticCursor = resolveAutoCursor(target, userSelect);
  if (!fallbackKeyword || fallbackKeyword === 'auto' || fallbackKeyword === 'default') {
    return semanticCursor;
  }
  if (fallbackKeyword === 'none' && semanticCursor !== 'default') {
    return semanticCursor;
  }
  return cursorAliases[fallbackKeyword] ?? 'default';
}

export function createProjectedCursorGlyph(
  ownerDocument: Document,
  kind: ProjectedCursorKind
): { hotspot: { x: number; y: number }; node: SVGSVGElement | null } {
  if (kind === 'hidden') return { hotspot: { x: 0, y: 0 }, node: null };
  const descriptor = cursorGlyphs[kind];
  const svg = ownerDocument.createElementNS(SVG_NAMESPACE, 'svg');
  svg.dataset['cursorGlyph'] = kind;
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('height', String(CURSOR_SIZE_CSS_PX));
  svg.setAttribute('viewBox', `0 0 ${CURSOR_SIZE_CSS_PX} ${CURSOR_SIZE_CSS_PX}`);
  svg.setAttribute('width', String(CURSOR_SIZE_CSS_PX));
  svg.style.cssText = `display:block;height:${CURSOR_SIZE_CSS_PX}px;width:${CURSOR_SIZE_CSS_PX}px;overflow:visible;`;
  for (const shape of descriptor.shapes) {
    const path = ownerDocument.createElementNS(SVG_NAMESPACE, 'path');
    path.setAttribute('d', shape.d);
    path.setAttribute('fill', shape.fill ?? 'none');
    if (shape.linecap) path.setAttribute('stroke-linecap', shape.linecap);
    if (shape.linejoin) path.setAttribute('stroke-linejoin', shape.linejoin);
    if (shape.stroke) path.setAttribute('stroke', shape.stroke);
    if (shape.strokeWidth) path.setAttribute('stroke-width', String(shape.strokeWidth));
    svg.append(path);
  }
  return { hotspot: descriptor.hotspot, node: svg };
}

export const projectedCursorSizeCssPx = CURSOR_SIZE_CSS_PX;
