import { createCanvas } from 'canvas';
import { expect, it, vi } from 'vitest';

const { prepare, render, DEFAULTS } = await vi.importActual<{
  prepare(image: unknown): unknown;
  render(context: unknown, source: unknown, catalog: unknown, settings: object): void;
  DEFAULTS: object;
}>('./render.mjs');

function changed(
  source: Uint8ClampedArray,
  output: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  w: number,
  h: number
) {
  let count = 0;
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) {
      const i = (yy * width + xx) * 4;
      if (
        source[i] !== output[i] ||
        source[i + 1] !== output[i + 1] ||
        source[i + 2] !== output[i + 2]
      )
        count++;
    }
  return count;
}
function execute(canvas: ReturnType<typeof createCanvas>) {
  const context = canvas.getContext('2d');
  const input = context.getImageData(0, 0, canvas.width, canvas.height);
  const catalog = prepare(input);
  const result = createCanvas(canvas.width, canvas.height);
  render(result.getContext('2d'), canvas, catalog, { ...DEFAULTS, content: 'text' });
  const output = result.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  return (x: number, y: number, w: number, h: number) =>
    changed(input.data, output.data, canvas.width, x, y, w, h);
}

it('erases paired terminal marks after a word and after owned baseline dots', () => {
  const canvas = createCanvas(400, 100),
    context = canvas.getContext('2d');
  context.fillStyle = '#112520';
  context.fillRect(0, 0, 400, 100);
  context.textBaseline = 'top';
  context.font = '14px monospace';
  context.fillStyle = '#00be69';
  context.fillText('sampleWord', 20, 20);
  context.fillRect(113, 23, 5, 5);
  context.fillRect(121, 31, 3, 4);
  context.fillText('sampleWord', 20, 60);
  for (const x of [108, 114, 120]) context.fillRect(x, 71, 3, 2);
  context.fillRect(128, 63, 5, 5);
  context.fillRect(136, 71, 3, 4);
  const delta = execute(canvas);
  for (const [x, y, w, h] of [
    [113, 23, 5, 5],
    [121, 31, 3, 4],
    [128, 63, 5, 5],
    [136, 71, 3, 4],
  ] as const)
    expect(delta(x, y, w, h)).toBe(w * h);
});

it('preserves separate upper marks and independent ellipsis and dropdown controls', () => {
  const canvas = createCanvas(400, 150),
    context = canvas.getContext('2d');
  context.fillStyle = '#112520';
  context.fillRect(0, 0, 400, 150);
  context.textBaseline = 'top';
  context.font = '14px monospace';
  context.fillStyle = '#00be69';
  context.fillText('sampleWord', 20, 20);
  context.fillRect(113, 23, 5, 5);
  context.fillText('sampleWord', 20, 60);
  for (const x of [120, 126, 132]) context.fillRect(x, 71, 3, 2);
  context.fillText('sampleWord', 20, 100);
  context.beginPath();
  context.moveTo(115, 106);
  context.lineTo(124, 106);
  context.lineTo(119.5, 111);
  context.closePath();
  context.fill();
  const delta = execute(canvas);
  expect(delta(113, 23, 5, 5)).toBe(0);
  expect(delta(120, 71, 15, 2)).toBe(0);
  expect(delta(115, 106, 9, 5)).toBe(0);
});

for (const framed of [false, true])
  it(
    framed
      ? 'preserves repeated framed controls in a text flow'
      : 'erases repeated line glyphs through colored text rows and preserves independent controls',
    () => {
      const canvas = createCanvas(500, 200),
        context = canvas.getContext('2d');
      context.fillStyle = '#112520';
      context.fillRect(0, 0, 500, 200);
      context.font = '14px monospace';
      context.textBaseline = 'top';
      const rows: Array<[string, number, number, string]> = [
        ['opening = calculate(value)', 16, 5, '#dddddd'],
        ['initial = calculate(value)', 46, 25, '#00be69'],
        ['initial = calculate(value)', 46, 45, '#00be69'],
        [')', 16, 65, '#dddddd'],
        ['opening = calculate(value)', 16, 85, '#dddddd'],
        ['third = calculate(value)', 46, 105, '#00be69'],
        ['fourth = calculate(value)', 46, 125, '#00be69'],
        [')', 16, 145, '#dddddd'],
        [')', 400, 65, '#dddddd'],
        [')', 400, 145, '#dddddd'],
      ];
      for (const [text, x, y, color] of rows) {
        if (color === '#00be69') {
          context.fillStyle = '#113526';
          context.fillRect(x, y, 235, 17);
        }
        context.fillStyle = color;
        context.fillText(text, x, y);
      }
      context.strokeStyle = '#dddddd';
      context.lineWidth = 1;
      for (const y of [62.5, 142.5]) {
        context.strokeRect(395.5, y, 16, 19);
        if (framed) context.strokeRect(11.5, y, 16, 19);
      }
      const delta = execute(canvas);
      for (const y of [65, 145]) {
        if (framed) expect(delta(18, y + 3, 4, 10)).toBe(0);
        else expect(delta(16, y, 10, 16)).toBeGreaterThan(3);
        expect(delta(400, y, 10, 16)).toBe(0);
      }
    }
  );

it('uses an adjacent font peer to recover baseline marks across agreement levels', async () => {
  const { recoverTerminalMarks } = await vi.importActual<{
    recoverTerminalMarks(
      image: unknown,
      boxes: object[]
    ): Array<{ x: number; w: number; terminalMark?: object }>;
  }>('./terminal-marks.mjs');
  const canvas = createCanvas(170, 60),
    context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 170, 60);
  context.fillStyle = '#222222';
  for (const start of [20, 80])
    for (let i = 0; i < 6; i++) {
      context.fillRect(start + i * 7, 20, 1, 7);
      context.fillRect(start + i * 7, 26, 4, 1);
    }
  context.fillRect(62, 25, 2, 4);
  const source = context.getImageData(0, 0, 170, 60);
  const metrics = {
    glyphs: 6,
    xHeight: 7,
    upperHeight: 7,
    stroke: 1,
    heightAgreement: 1,
    baselineAgreement: 2 / 3,
    glyphBounds: { x: 20, y: 20, w: 39, h: 7 },
  };
  const label = {
    x: 18,
    y: 18,
    w: 43,
    h: 12,
    bg: [255, 255, 255],
    shape: 'text',
    textConfidence: true,
    typeMetrics: metrics,
  };
  const peer = {
    x: 78,
    y: 18,
    w: 43,
    h: 12,
    bg: [255, 255, 255],
    shape: 'text',
    textConfidence: true,
    typeMetrics: {
      ...metrics,
      baselineAgreement: 1,
      glyphBounds: { ...metrics.glyphBounds, x: 80 },
    },
  };
  expect(recoverTerminalMarks(source, [label])[0]!.terminalMark).toBeUndefined();
  expect(recoverTerminalMarks(source, [label, peer])[0]!.terminalMark).toMatchObject({
    x: 62,
    y: 25,
    w: 2,
    h: 4,
  });
  const confident = { ...label, typeMetrics: { ...metrics, baselineAgreement: 1 } };
  expect(recoverTerminalMarks(source, [confident])[0]!.terminalMark).toBeUndefined();
  expect(recoverTerminalMarks(source, [confident, peer])[0]!.terminalMark).toMatchObject({
    x: 62,
    y: 25,
    w: 2,
    h: 4,
  });
  const control = {
    x: 61,
    y: 24,
    w: 5,
    h: 6,
    bg: [255, 255, 255],
    shape: 'icon',
    kind: 'control-icon',
  };
  expect(recoverTerminalMarks(source, [confident, peer, control])[0]!.terminalMark).toBeUndefined();
  expect(recoverTerminalMarks(source, [label, peer, control])[0]!.terminalMark).toBeUndefined();
});

for (const panel of [false, true])
  it(
    panel
      ? 'recovers multiline text inside a shared enclosing panel'
      : 'recovers closures after different counts of indented rows',
    () => {
      const canvas = createCanvas(360, 300),
        context = canvas.getContext('2d');
      context.fillStyle = '#112520';
      context.fillRect(0, 0, 360, 300);
      if (panel) {
        context.strokeStyle = '#b0b0b0';
        context.strokeRect(5.5, 5.5, 300, 275);
      }
      context.font = '14px monospace';
      context.textBaseline = 'top';
      const closures: number[] = [];
      for (const [top, count] of [
        [15, 3],
        [145, 4],
      ] as const) {
        context.fillStyle = '#dddddd';
        context.fillText('opening = calculate(value)', 16, top);
        for (let i = 1; i <= count; i++) {
          context.fillStyle = '#113526';
          context.fillRect(46, top + i * 20, 235, 17);
          context.fillStyle = '#00be69';
          context.fillText('initial = calculate(value)', 46, top + i * 20);
        }
        const y = top + (count + 1) * 20;
        closures.push(y);
        context.fillStyle = '#dddddd';
        context.fillText(')', 16, y);
      }
      const delta = execute(canvas);
      for (const y of closures) expect(delta(16, y, 10, 16)).toBeGreaterThan(3);
    }
  );

it('claims an unknown only when all its foreground belongs to the terminal pair', async () => {
  const { recoverTerminalMarks } = await vi.importActual<{
    recoverTerminalMarks(
      image: unknown,
      boxes: object[]
    ): Array<{ shape: string; terminalMark?: object }>;
  }>('./terminal-marks.mjs');
  const canvas = createCanvas(250, 60),
    context = canvas.getContext('2d');
  context.fillStyle = '#112520';
  context.fillRect(0, 0, 250, 60);
  context.fillStyle = '#00be69';
  context.textBaseline = 'top';
  context.font = '14px monospace';
  context.fillText('sampleWord', 20, 20);
  const plain = context.getImageData(0, 0, 250, 60);
  const catalog = prepare(plain) as Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    shape: string;
  }>;
  const label = catalog.find((box) => box.shape === 'text');
  expect(label).toBeDefined();
  const fullLabel = { ...label!, w: 86 };
  context.fillRect(113, 23, 5, 5);
  context.fillRect(121, 31, 3, 4);
  const unknown = { x: 111, y: 21, w: 16, h: 16, bg: [17, 37, 32], shape: 'unknown', kind: 'auto' };
  const recovered = recoverTerminalMarks(context.getImageData(0, 0, 250, 60), [fullLabel, unknown]);
  expect(recovered[0]!.terminalMark).toBeDefined();
  expect(recovered.some((box) => box.shape === 'unknown')).toBe(false);
  context.fillRect(125, 24, 2, 3);
  const conflict = recoverTerminalMarks(context.getImageData(0, 0, 250, 60), [fullLabel, unknown]);
  expect(conflict[0]!.terminalMark).toBeUndefined();
  expect(conflict.some((box) => box.shape === 'unknown')).toBe(true);
});

it('does not publish narrow repeated symbols without matching text flow', () => {
  const canvas = createCanvas(180, 100),
    context = canvas.getContext('2d');
  context.fillStyle = '#112520';
  context.fillRect(0, 0, 180, 100);
  context.fillStyle = '#dddddd';
  context.textBaseline = 'top';
  context.font = '14px monospace';
  context.fillText(')', 80, 15);
  context.fillText(')', 80, 65);
  const source = context.getImageData(0, 0, 180, 100);
  const catalog = prepare(source) as Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    shape: string;
  }>;
  for (const y of [15, 65])
    expect(catalog.some((b) => b.x < 90 && b.x + b.w > 80 && b.y < y + 16 && b.y + b.h > y)).toBe(
      false
    );
});

it.each([1, 2])('recovers text-flow glyphs at raster scale %s', (scale) => {
  const canvas = createCanvas(360 * scale, 250 * scale);
  const context = canvas.getContext('2d');
  context.scale(scale, scale);
  context.fillStyle = '#121418';
  context.fillRect(0, 0, 360, 250);
  context.font = '14px monospace';
  context.textBaseline = 'top';
  for (const top of [15, 135]) {
    context.fillStyle = '#dddddd';
    context.fillText('r = calculate(value)', 16, top);
    for (const offset of [20, 40]) {
      context.fillStyle = '#113526';
      context.fillRect(46, top + offset, 235, 17);
      context.fillStyle = '#00be69';
      context.fillText('initial = calculate(value)', 46, top + offset);
    }
    context.fillStyle = '#dddddd';
    context.fillText(')', 16, top + 60);
  }
  const delta = execute(canvas);
  for (const y of [75, 195])
    expect(delta(16 * scale, y * scale, 10 * scale, 16 * scale)).toBeGreaterThan(3);
});

for (const family of ['monospace', 'sans-serif'])
  for (const scale of [1, 2])
    it(`erases an isolated inline letter in ${family} at scale ${scale}`, () => {
      const canvas = createCanvas(700 * scale, 120 * scale);
      const context = canvas.getContext('2d');
      context.scale(scale, scale);
      context.fillStyle = '#08090c';
      context.fillRect(0, 0, 700, 120);
      context.fillStyle = '#eeeeee';
      context.font = `bold 24px ${family}`;
      context.textBaseline = 'alphabetic';
      const prefix = 'Paragraphs, ';
      const x = 40 + context.measureText(prefix).width;
      const width = context.measureText('a').width;
      context.fillText(`${prefix}a and captions`, 40, 55);
      const delta = execute(canvas);
      expect(
        delta(Math.floor(x * scale), 32 * scale, Math.ceil(width * scale), 26 * scale)
      ).toBeGreaterThan(10);
    });

it.each(['а', 'и', 'в'])(
  'erases the Cyrillic one-letter word %s within a source font row',
  (letter) => {
    const canvas = createCanvas(850, 120),
      context = canvas.getContext('2d');
    context.fillStyle = '#08090c';
    context.fillRect(0, 0, 850, 120);
    context.fillStyle = '#eeeeee';
    context.font = 'bold 24px monospace';
    context.textBaseline = 'alphabetic';
    const prefix = 'Правила, ',
      x = 40 + context.measureText(prefix).width;
    context.fillText(`${prefix}${letter} взаимные связи`, 40, 55);
    expect(execute(canvas)(Math.floor(x), 32, 15, 26)).toBeGreaterThan(10);
  }
);

it.each(['plus', 'circle', 'colored-letter', 'distant-letter'])(
  'preserves an independent %s between text labels',
  (symbol) => {
    const canvas = createCanvas(700, 120),
      context = canvas.getContext('2d');
    context.fillStyle = '#08090c';
    context.fillRect(0, 0, 700, 120);
    context.fillStyle = '#eeeeee';
    context.font = 'bold 24px monospace';
    context.textBaseline = 'alphabetic';
    context.fillText('Paragraphs,', 40, 55);
    const x = 40 + context.measureText('Paragraphs, ').width;
    context.fillText('and captions', symbol === 'distant-letter' ? x + 90 : x + 29, 55);
    if (symbol === 'plus') context.fillText('+', x, 55);
    if (symbol === 'circle') {
      context.strokeStyle = '#eeeeee';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(x + 7, 47, 6, 0, Math.PI * 2);
      context.stroke();
    }
    if (symbol === 'colored-letter') {
      context.fillStyle = '#ee3b3b';
      context.fillText('a', x, 55);
    }
    if (symbol === 'distant-letter') context.fillText('a', x + 40, 55);
    const left = symbol === 'distant-letter' ? x + 39 : x - 1;
    expect(execute(canvas)(Math.floor(left), 31, 18, 27)).toBe(0);
  }
);
