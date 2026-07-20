import { expect, it, vi } from 'vitest';

import { drawShapeClip, drawTextClip } from './overlays';

type TestTextClip = {
  style: Record<string, unknown>;
  text: string;
};

function createContext() {
  return {
    beginPath: vi.fn(),
    closePath: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 10 })),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    stroke: vi.fn(),
    textAlign: 'left',
    textBaseline: 'alphabetic',
  } as unknown as CanvasRenderingContext2D;
}

function createTextClip(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    text: 'hello world from sniptale',
    style: {
      backgroundColor: '#000',
      borderColor: '#fff',
      borderRadius: 12,
      borderWidth: 2,
      color: '#fff',
      fontFamily: 'serif',
      fontSize: 10,
      fontWeight: 400,
      lineHeight: 1.2,
      padding: 8,
      textAlign: 'center',
      ...overrides,
    },
  } as TestTextClip;
}

it('draws wrapped text clips with border and centered alignment', () => {
  const context = createContext();

  drawTextClip(context, createTextClip() as never, 0, 0, 120, 80);

  expect(context.fill).toHaveBeenCalled();
  expect(context.stroke).toHaveBeenCalled();
  expect(context.fillText).toHaveBeenCalled();
  expect(context.textAlign).toBe('center');
});

it('keeps export text drawing aligned with shared composition overlay behavior', () => {
  const context = createContext();

  drawTextClip(context, createTextClip({ padding: 10 }) as never, 0, 0, 120, 80);

  expect(context.fillText).toHaveBeenCalledWith(expect.any(String), 60, 10, 100);
});

it('draws right-aligned text without stroking when the border width is zero', () => {
  const context = createContext();
  const fillText = vi.spyOn(context, 'fillText');

  drawTextClip(
    context,
    {
      ...createTextClip({ borderWidth: 0, textAlign: 'right' }),
      text: 'line one\n\nline three',
    } as never,
    10,
    5,
    120,
    80
  );

  expect(context.stroke).not.toHaveBeenCalled();
  expect(context.textAlign).toBe('right');
  expect(fillText).toHaveBeenNthCalledWith(1, 'line one', 122, 13, 104);
  expect(fillText).toHaveBeenNthCalledWith(2, '', 122, 25, 104);
});

it('draws ellipse and rounded-rect shape clips', () => {
  const context = createContext();

  drawShapeClip(
    context,
    {
      shapeType: 'ELLIPSE',
      style: { fillColor: '#f00', strokeColor: '#0f0', strokeWidth: 2 },
    } as never,
    0,
    0,
    100,
    50
  );
  drawShapeClip(
    context,
    {
      shapeType: 'RECTANGLE',
      style: { borderRadius: 8, fillColor: '#f00', strokeColor: '#0f0', strokeWidth: 2 },
    } as never,
    10,
    20,
    80,
    60
  );

  expect(context.ellipse).toHaveBeenCalledOnce();
  expect(context.quadraticCurveTo).toHaveBeenCalled();
});

it('draws left-aligned text with clamped border radius and preserves long single words', () => {
  const context = createContext();

  drawTextClip(
    context,
    {
      ...createTextClip({
        borderRadius: 100,
        fontWeight: 600,
        textAlign: 'left',
      }),
      text: 'supercalifragilisticexpialidocious',
    } as never,
    0,
    0,
    40,
    20
  );

  expect(context.textAlign).toBe('left');
  expect(context.fillText).toHaveBeenCalledWith('supercalifragilisticexpialidocious', 8, 8, 24);
  expect(context.quadraticCurveTo).toHaveBeenCalled();
});
