import { expect, it } from 'vitest';

import { buildArrowHeadPath, getArrowHeadAttachmentInset } from './heads';
import { buildTriangleOutlinePath } from './heads-outline';

function readPathNumbers(path: string): number[] {
  const numbers: number[] = [];
  let token = '';

  for (const char of path) {
    if ('0123456789.-+eE'.includes(char)) {
      token += char;
      continue;
    }
    if (token) {
      numbers.push(Number(token));
      token = '';
    }
  }
  if (token) {
    numbers.push(Number(token));
  }
  return numbers.filter(Number.isFinite);
}

function getPathXCoordinates(path: string): number[] {
  const numbers = readPathNumbers(path);
  const coordinates: number[] = [];
  for (let index = 0; index < numbers.length; index += 2) {
    const x = numbers[index];
    if (typeof x === 'number') {
      coordinates.push(x);
    }
  }
  return coordinates;
}

function getPathCoordinates(path: string): Array<{ x: number; y: number }> {
  const numbers = readPathNumbers(path);
  const coordinates: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < numbers.length; index += 2) {
    const x = numbers[index];
    const y = numbers[index + 1];
    if (typeof x === 'number' && typeof y === 'number') {
      coordinates.push({ x, y });
    }
  }
  return coordinates;
}

it('builds the excalidraw-like head set with compact attachment insets', () => {
  const heads = [
    'none',
    'arrow',
    'triangle',
    'triangle-outline',
    'bar',
    'circle',
    'circle-outline',
    'diamond',
    'diamond-outline',
    'crosshair-circle',
  ] as const;

  const paths = heads.map((head) => buildArrowHeadPath(head, { x: 24, y: 12 }, 0, 6));

  expect(paths[0]).toBe('');
  expect(paths.slice(1).every((path) => path.includes('M'))).toBe(true);
  expect(getArrowHeadAttachmentInset('triangle', 6)).toBeGreaterThan(0);
  expect(getArrowHeadAttachmentInset('arrow', 6)).toBeGreaterThan(0);
  expect(getArrowHeadAttachmentInset('bar', 6)).toBeGreaterThan(0);
  expect(getArrowHeadAttachmentInset('crosshair-circle', 6)).toBe(0);
});

it('anchors filled heads at the arrow endpoint instead of around it', () => {
  const tip = 100;
  const paths = ['triangle', 'diamond', 'block', 'arrow'].map((head) =>
    buildArrowHeadPath(head as never, { x: tip, y: 0 }, 0, 24)
  );

  paths.forEach((path) => {
    expect(Math.max(...getPathXCoordinates(path))).toBeCloseTo(tip, 6);
  });
});

it('trims high-width shafts to the real head attachment depth', () => {
  const width = 24;

  expect(getArrowHeadAttachmentInset('triangle', width)).toBeGreaterThan(width * 2);
  expect(getArrowHeadAttachmentInset('diamond', width)).toBeLessThan(
    getArrowHeadAttachmentInset('triangle', width)
  );
  expect(getArrowHeadAttachmentInset('arrow', width)).toBeGreaterThan(width * 2);
});

it('scales head geometry with separate size controls', () => {
  const width = 12;
  const small = getArrowHeadAttachmentInset('triangle', width, 1);
  const large = getArrowHeadAttachmentInset('triangle', width, 6);
  const path = buildArrowHeadPath('diamond', { x: 100, y: 0 }, 0, width, 6);

  expect(large).toBeGreaterThan(small * 5);
  expect(Math.min(...getPathXCoordinates(path))).toBeLessThan(100 - width * 20);
});

it('uses excalidraw-style proportions for high-width arrow, triangle, and diamond heads', () => {
  const width = 24;
  const tip = { x: 100, y: 0 };
  const open = getPathCoordinates(buildArrowHeadPath('arrow', tip, 0, width));
  const triangle = getPathCoordinates(buildArrowHeadPath('triangle', tip, 0, width));
  const diamond = getPathCoordinates(buildArrowHeadPath('diamond', tip, 0, width));

  expect(Math.max(...open.map((point) => point.x))).toBeCloseTo(tip.x, 6);
  expect(Math.min(...open.map((point) => point.x))).toBeLessThan(tip.x - width * 3);
  expect(Math.max(...open.map((point) => point.y))).toBeGreaterThan(width);
  expect(Math.min(...triangle.map((point) => point.x))).toBeCloseTo(26.045, 3);
  expect(Math.max(...triangle.map((point) => Math.abs(point.y)))).toBeCloseTo(34.486, 3);
  expect(Math.min(...diamond.map((point) => point.x))).toBeCloseTo(-2.232, 3);
  expect(Math.max(...diamond.map((point) => Math.abs(point.y)))).toBeCloseTo(23.836, 3);
});

it('keeps outline head generation stable for empty custom vertices', () => {
  expect(buildTriangleOutlinePath([], { x: 0, y: 0 }, 0, 8)).toBeTypeOf('string');
});
