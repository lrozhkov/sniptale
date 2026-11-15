export const RECIPE_VERSION = '1';
export const CORPUS_VIEWPORT = Object.freeze({ width: 960, height: 760 });
export const SPLIT_DEFINITION = Object.freeze({
  version: 1,
  tuning: ['rows', 'columns', 'paragraphs', 'code-panels', 'negative'],
  holdout: ['cards', 'ledger'],
  policy: 'Template families are disjoint. Reclassify consumed holdout before further tuning.',
});

const faces = [
  'sans',
  'sans-bold',
  'serif',
  'serif-bold',
  'serif-italic',
  'mono',
  'mono-italic',
  'handwriting-latin',
  'handwriting-cyrillic',
  'arabic',
  'cjk',
];
const refreshedSplit = Object.freeze({
  ...SPLIT_DEFINITION,
  version: 2,
  holdout: ['forms', 'timeline'],
});

export function splitDefinitionFor(holdoutRevision = 1) {
  if (holdoutRevision !== 1 && holdoutRevision !== 2) throw new Error('Invalid holdout revision');
  return holdoutRevision === 1 ? SPLIT_DEFINITION : refreshedSplit;
}
const sizes = [10, 12, 16, 24, 32];
const palettes = [
  { id: 'black', background: '#ffffff', foreground: '#111111' },
  { id: 'colored', background: '#f4f8fc', foreground: '#1558a0' },
  { id: 'light-on-dark', background: '#172331', foreground: '#edf3fc' },
  { id: 'low-contrast', background: '#f1f1f1', foreground: '#bbbbbb' },
  { id: 'similar-luminance', background: '#85ac86', foreground: '#ba9291' },
];
const words = {
  'handwriting-latin': [
    'Friendly note',
    'Sample handwriting',
    'Letters and words',
    'A short message',
  ],
  'handwriting-cyrillic': [
    'Рукописный текст',
    'Пример письма',
    'Короткая заметка',
    'Слова и буквы',
  ],
  arabic: ['مرحبا بالعالم', 'الكتابة العربية', 'نص قصير واضح', 'سلام عليكم'],
  cjk: ['中文漢字日本語', 'かなカナ文字', '日本語中文', '漢字とひらがな'],
};
const ordinary = [
  'Пример текста 123',
  'Latin and Кириллица',
  'A short caption',
  'Price: $12.50',
  '2026-11-13 09:45',
  'Élève déjà vu',
  'One symbol: W',
  'Dense text stays on its own panel and wraps without touching another fragment.',
];

function random(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value;
  };
}

function fragments(face, size, palette, family, next) {
  return Array.from({ length: 12 }, (_, index) => {
    const technical = index >= 8;
    const texts = words[face] ?? ordinary.slice(0, 7);
    const sampledText = technical
      ? ['const value = items[2];', '€ 42.50 / 2026-11-13', 'x2 + y2 = 5', 'Café and nöel'][
          index - 8
        ]
      : !words[face] && index === 7
        ? ordinary[7]
        : texts[(index + ((next() >>> 8) % texts.length)) % texts.length];
    const text =
      index === 6
        ? ({ 'handwriting-cyrillic': 'Ж', arabic: 'م', cjk: '漢' }[face] ?? 'W')
        : sampledText;
    const fontId = technical ? 'mono' : face;
    const columns =
      family === 'forms'
        ? 4
        : ['columns', 'cards'].includes(family)
          ? 3
          : ['ledger', 'timeline'].includes(family)
            ? 1
            : 2;
    const row = Math.floor(index / columns),
      column = index % columns;
    const layout =
      family === 'forms'
        ? { x: 28 + column * 232, y: 28 + row * 202, width: 208, height: 184 }
        : family === 'timeline'
          ? { x: 116, y: 22 + row * 54, width: 816, height: 50 }
          : family === 'ledger'
            ? { x: 28, y: 22 + row * 54, width: 904, height: 50 }
            : family === 'cards'
              ? { x: 40 + column * 308, y: 34 + row * 154, width: 264, height: 138 }
              : family === 'columns'
                ? { x: 28 + column * 312, y: 22 + row * 156, width: 280, height: 144 }
                : { x: 28 + column * 472, y: 22 + row * 106, width: 432, height: 94 };
    const dense = !technical && index === 7 && !words[face];
    return {
      id: `fragment-${String(index).padStart(2, '0')}`,
      text,
      fontId,
      ...layout,
      size: technical ? 16 : dense ? Math.min(size, 16) : size,
      lineHeight: ['ledger', 'timeline'].includes(family) ? 1 : [1, 1.3, 1.6][(row + column) % 3],
      letterSpacing: face === 'arabic' ? 0 : [0, 0.5, 1.25][(index + size) % 3],
      direction: face === 'arabic' && !technical ? 'rtl' : 'ltr',
      align: family === 'ledger' ? 'right' : family === 'cards' ? 'center' : 'left',
      math: index === 10,
      color: palette.foreground,
      background:
        index % 3 === 0 && ['black', 'colored'].includes(palette.id)
          ? '#e5eef8'
          : palette.background,
      tags: [
        fontId,
        technical
          ? ['code', 'price-date', 'formula-sup-sub', 'combining-diacritics'][index - 8]
          : dense
            ? 'dense-paragraph'
            : index === 6
              ? 'isolated-caption'
              : 'text',
        `size-${technical ? 16 : dense ? Math.min(size, 16) : size}`,
      ],
    };
  });
}

/** Return the frozen pairwise design; the seed changes text choices, never the split. */
export function recipesFor({ profile = 'smoke', seed = 1, holdoutRevision = 1 } = {}) {
  if (
    !['smoke', 'full'].includes(profile) ||
    !Number.isSafeInteger(seed) ||
    seed < 0 ||
    seed > 0xffffffff
  )
    throw new Error('Invalid corpus profile or seed');
  const split = splitDefinitionFor(holdoutRevision);
  const families = [...split.tuning.slice(0, 4), ...split.holdout];
  const next = random(seed),
    cases = [];
  for (let face = 0; face < faces.length; face++) {
    for (let family = 0; family < families.length; family++) {
      const size = sizes[(face + family) % sizes.length];
      const palette = palettes[(face + family * 2) % palettes.length];
      const boundary = ['inside', 'edge', 'partial'][(face + family) % 3];
      const list = fragments(faces[face], size, palette, families[family], next);
      // The edge is derived from the first fragment's actual box, without cutting its neighbors.
      const region =
        boundary === 'inside'
          ? { x: 0, y: 0, width: 960, height: 760 }
          : boundary === 'edge'
            ? { x: 28, y: 22, width: 904, height: 714 }
            : { x: 82, y: 22, width: 850, height: 714 };
      cases.push({
        id: `${families[family]}-${faces[face]}`,
        family: families[family],
        split: family < 4 ? 'tuning' : 'holdout',
        dpr: (face + family) % 4 === 0 ? 2 : 1,
        size,
        palette,
        region,
        fragments: list,
        tags: [
          families[family],
          faces[face],
          palette.id,
          `size-${size}`,
          `roi-${boundary}`,
          'flat-background',
          'protected-geometry',
        ],
      });
    }
  }
  for (const negative of ['empty-panels', 'frames-dividers', 'grids', 'stroke-like']) {
    cases.push({
      id: `negative-${negative}`,
      family: 'negative',
      split: 'tuning',
      dpr: 1,
      palette: palettes[0],
      region: { x: 0, y: 0, width: 960, height: 760 },
      fragments: [],
      negative,
      tags: ['negative', negative, 'protected-geometry', 'flat-background'],
    });
  }
  if (profile === 'full') return cases;
  const smoke = new Set([
    'rows-sans',
    'columns-serif-italic',
    'paragraphs-mono',
    'code-panels-handwriting-latin',
    `${split.holdout[0]}-handwriting-cyrillic`,
    `${split.holdout[1]}-arabic`,
    'rows-cjk',
    'negative-grids',
  ]);
  return cases.filter((entry) => smoke.has(entry.id));
}

export function requiredFontText(cases) {
  const output = {};
  for (const entry of cases)
    for (const fragment of entry.fragments)
      output[fragment.fontId] = (output[fragment.fontId] ?? '') + fragment.text;
  return output;
}

const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (value) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[value]
  );

/** Text and protected geometry have separate ink toggles which do not affect layout. */
export function renderRecipe(entry) {
  const panels = entry.fragments
    .map((fragment) => {
      const content = fragment.math ? 'x<sup>2</sup> + y<sub>2</sub> = 5' : escape(fragment.text);
      const panelStyle = [
        `left:${fragment.x}px`,
        `top:${fragment.y}px`,
        `width:${fragment.width}px`,
        `height:${fragment.height}px`,
        `background:${fragment.background}`,
      ].join(';');
      const textStyle = [
        `font-family:Corpus_${fragment.fontId}`,
        `font-style:${fragment.fontId.endsWith('italic') ? 'italic' : 'normal'}`,
        `font-weight:${fragment.fontId.endsWith('bold') ? 700 : 400}`,
        'font-synthesis:none',
        `font-size:${fragment.size}px`,
        `line-height:${fragment.lineHeight}`,
        `letter-spacing:${fragment.letterSpacing}px`,
        `text-align:${fragment.align}`,
        `color:${fragment.color}`,
      ].join(';');
      return [
        `<section class="panel" style="${panelStyle}">`,
        `<span data-fragment="${fragment.id}" dir="${fragment.direction}" style="${textStyle}">`,
        content,
        '</span></section>',
      ].join('');
    })
    .join('');
  const commonGeometry = [
    '<path d="M30 690H930 M30 710H930 M30 730H930 M120 680V742 M320 680V742 M520 680V742 M720 680V742"',
    ' stroke="#4b657f" stroke-width="2" fill="none"/>',
    '<rect x="26" y="674" width="908" height="72" fill="none" stroke="#48617b" stroke-width="2"/>',
  ].join('');
  const negativeGeometry = {
    'stroke-like': [
      '<path d="M150 100v100h35v-100 M220 100h40v100 M300 100v100 M330 100v100"',
      ' fill="none" stroke="#223344" stroke-width="3"/>',
    ].join(''),
    'frames-dividers':
      '<rect x="40" y="50" width="700" height="400" fill="none" stroke="#223344" stroke-width="2"/>',
    grids: [
      '<path d="M40 60H800 M40 120H800 M40 180H800 M40 240H800 M40 300H800 M40 60V300 M180 60V300',
      ' M320 60V300 M460 60V300 M600 60V300 M800 60V300" fill="none" stroke="#223344" stroke-width="1"/>',
    ].join(''),
  };
  const geometry =
    entry.negative === 'empty-panels'
      ? '<rect x="40" y="60" width="400" height="280" fill="#dae5f0"/>'
      : commonGeometry + (negativeGeometry[entry.negative] ?? '');
  const replacementGeometry =
    entry.family === 'forms'
      ? entry.fragments
          .map((fragment) =>
            [
              `<rect x="${fragment.x - 2}" y="${fragment.y - 2}"`,
              ` width="${fragment.width + 4}" height="${fragment.height + 4}"`,
              ' rx="3" fill="none" stroke="#48617b" stroke-width="1"/>',
            ].join('')
          )
          .join('')
      : entry.family === 'timeline'
        ? '<path d="M72 22V666" fill="none" stroke="#48617b" stroke-width="2"/>' +
          entry.fragments
            .map((fragment) =>
              [
                `<path d="M72 ${fragment.y + 25}H108" fill="none" stroke="#48617b" stroke-width="2"/>`,
                `<circle cx="72" cy="${fragment.y + 25}" r="3" fill="#48617b"/>`,
              ].join('')
            )
            .join('')
        : '';
  const styles = [
    '*{box-sizing:border-box}',
    `html,body{margin:0;width:960px;height:760px;overflow:hidden;background:${entry.palette.background}}`,
    `.panel{position:absolute;padding:6px 10px;overflow:hidden;background:${entry.palette.background}}`,
    '[data-fragment]{display:block;white-space:normal;overflow-wrap:normal}',
    'sup,sub{font-size:70%;line-height:0}',
    '.hide-text [data-fragment]{visibility:hidden}',
    '.hide-geometry [data-protected]{visibility:hidden}',
    'svg{position:absolute;inset:0;pointer-events:none}',
  ].join('');
  return [
    '<!doctype html><html><head><meta charset="utf-8"><style>',
    styles,
    '</style></head><body>',
    panels,
    '<svg data-protected width="960" height="760" viewBox="0 0 960 760">',
    geometry,
    replacementGeometry,
    '</svg></body></html>',
  ].join('');
}
