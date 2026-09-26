import type { EditorTool } from '../../../../features/editor/document/types';

type CursorArt = { svg: string; x: number; y: number };

const outline = 'fill="white" stroke="#172033" stroke-width="1.5" stroke-linejoin="round"';
const arrowStroke = [
  '<path d="M4 20 19 5M11 5h8v8" fill="none" stroke="white"',
  ' stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
  '<path d="M4 20 19 5M11 5h8v8" fill="none" stroke="#172033"',
  ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
].join('');

// Hotspots stay at the drawing origin: the nib for strokes, the tail or head for
// arrows, and the first corner of a dragged blur region.
const art: Record<'pencil' | 'marker' | 'arrow' | 'arrowFromTip' | 'blur', CursorArt> = {
  pencil: {
    svg: `<path d="M4 20l3.8-1.1L20 6.7 17.3 4 5.1 16.2 4 20Z" ${outline}/><path d="m15.7 5.6 2.7 2.7M5.1 16.2l2.7 2.7" fill="none" stroke="#172033" stroke-width="1.3"/>`,
    x: 4,
    y: 20,
  },
  marker: {
    svg: `<path d="m4 20 4.4-.9L20 7.5 16.5 4 4.9 15.6 4 20Z" ${outline}/><path d="m5 15.5 3.5 3.5M15 5.5l3.5 3.5" fill="none" stroke="#eab308" stroke-width="2"/>`,
    x: 4,
    y: 20,
  },
  arrow: {
    svg: arrowStroke,
    x: 4,
    y: 20,
  },
  arrowFromTip: {
    svg: `${arrowStroke}<circle cx="19" cy="5" r="2" fill="#2563eb" stroke="white" stroke-width=".8"/>`,
    x: 19,
    y: 5,
  },
  blur: {
    svg: [
      '<rect x="4" y="4" width="16" height="16" rx="2" fill="white"',
      ' fill-opacity=".45" stroke="#172033" stroke-width="1.5" stroke-dasharray="3 2"/>',
      '<circle cx="12" cy="12" r="3.5" fill="none" stroke="#172033" stroke-width="1.2" opacity=".8"/>',
    ].join(''),
    x: 4,
    y: 4,
  },
};

function svgCursor(cursorArt: CursorArt): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">${cursorArt.svg}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${cursorArt.x} ${cursorArt.y}, crosshair`;
}

const cursors = {
  pencil: svgCursor(art.pencil),
  marker: svgCursor(art.marker),
  arrow: svgCursor(art.arrow),
  arrowFromTip: svgCursor(art.arrowFromTip),
  blur: svgCursor(art.blur),
};

export function resolveEditorToolCursor(tool: EditorTool, arrowDrawFromTip = false): string {
  switch (tool) {
    case 'pencil':
      return cursors.pencil;
    case 'marker':
      return cursors.marker;
    case 'arrow':
      return arrowDrawFromTip ? cursors.arrowFromTip : cursors.arrow;
    case 'blur':
      return cursors.blur;
    case 'text':
      return 'text';
    case 'select':
      return 'default';
    case 'crop':
    case 'frame-annotation':
    case 'image':
    case 'shape':
    case 'step':
      return 'crosshair';
  }
}
