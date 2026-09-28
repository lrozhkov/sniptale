import type { DrawingTool } from './model';

type CursorArt = { svg: string; x: number; y: number; size?: number };

const outline = 'fill="white" stroke="#172033" stroke-width="1.5" stroke-linejoin="round"';
const contactPath = 'M5 0v3m0 4v3M0 5h3m4 0h3';
const contactMark = [
  `<path d="${contactPath}" fill="none" stroke="white" stroke-width="3"/>`,
  `<path d="${contactPath}" fill="none" stroke="#172033" stroke-width="1.4"/>`,
].join('');
const blurBounds = 'x="13" y="14" width="15" height="13" rx="2"';

function arrowGlyph(path: string): string {
  return [
    `<path d="${path}" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<path d="${path}" fill="none" stroke="#172033" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  ].join('');
}

// The shared contact mark leaves the gesture origin visible; tool art sits away from it.
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
    svg: `${contactMark}${arrowGlyph('M14 14 27 27m-8 0h8v-8')}`,
    x: 5,
    y: 5,
    size: 32,
  },
  arrowFromTip: {
    svg: `${contactMark}${arrowGlyph('M27 27 14 14m0 8v-8h8')}`,
    x: 5,
    y: 5,
    size: 32,
  },
  blur: {
    svg: [
      contactMark,
      `<rect ${blurBounds} fill="#dbeafe" stroke="white" stroke-width="3"/>`,
      `<rect ${blurBounds} fill="none" stroke="#172033" stroke-width="1.5" stroke-dasharray="3 2"/>`,
      '<circle cx="20.5" cy="20.5" r="4" fill="#60a5fa" opacity=".45"/>',
      '<circle cx="20.5" cy="20.5" r="2" fill="#2563eb" opacity=".45"/>',
    ].join(''),
    x: 5,
    y: 5,
    size: 32,
  },
};

function svgCursor(cursorArt: CursorArt): string {
  const size = cursorArt.size ?? 24;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${cursorArt.svg}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${cursorArt.x} ${cursorArt.y}, crosshair`;
}

const cursors = {
  pencil: svgCursor(art.pencil),
  marker: svgCursor(art.marker),
  arrow: svgCursor(art.arrow),
  arrowFromTip: svgCursor(art.arrowFromTip),
  blur: svgCursor(art.blur),
};

export function resolveDrawingToolCursor(tool: DrawingTool, arrowDrawFromTip = false): string {
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
    case 'shape':
      return 'crosshair';
  }
}
