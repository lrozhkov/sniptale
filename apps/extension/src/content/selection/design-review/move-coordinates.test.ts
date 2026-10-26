// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readDesignReviewMoveCoordinates } from './move-coordinates';

const rotations = vi.fn();

class CoordinateMatrix {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  m33 = 1;
  m44 = 1;
  constructor(values?: number[] | string) {
    if (typeof values === 'string') {
      if (!values.startsWith('matrix(')) throw new Error('Unsupported matrix');
      values = values.slice(7, -1).split(',').map(Number);
    }
    if (values) {
      this.a = values[0]!;
      this.b = values[1]!;
      this.c = values[2]!;
      this.d = values[3]!;
    }
  }
  scale(x = 1, y = x) {
    return this.multiply(new CoordinateMatrix([x, 0, 0, y]));
  }
  rotate(value: number) {
    rotations(value);
    const radians = (value * Math.PI) / 180;
    return this.multiply(
      new CoordinateMatrix([
        Math.cos(radians),
        Math.sin(radians),
        -Math.sin(radians),
        Math.cos(radians),
      ])
    );
  }
  multiply(next: CoordinateMatrix) {
    return new CoordinateMatrix([
      this.a * next.a + this.c * next.b,
      this.b * next.a + this.d * next.b,
      this.a * next.c + this.c * next.d,
      this.b * next.c + this.d * next.d,
    ]);
  }
  inverse() {
    const determinant = this.a * this.d - this.b * this.c;
    return new CoordinateMatrix([
      this.d / determinant,
      -this.b / determinant,
      -this.c / determinant,
      this.a / determinant,
    ]);
  }
}

beforeEach(() => {
  vi.stubGlobal('DOMMatrix', CoordinateMatrix);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) =>
    element instanceof HTMLElement ? element.style : document.body.style
  );
});

afterEach(() => {
  rotations.mockClear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it.each([
  ['90deg', 90],
  ['100grad', 90],
  ['.5turn', 180],
  [`${Math.PI}rad`, 180],
  ['-22.5deg', -22.5],
  ['z 30deg', 30],
  ['0 0 -1 30deg', -30],
  ['1.deg', 1],
])('accepts supported numeric rotation %s with its unit and 2D axis', (rotation, degrees) => {
  const parent = document.createElement('div');
  const target = document.createElement('div');
  Object.defineProperty(parent.style, 'rotate', { value: rotation });
  parent.append(target);
  document.body.append(parent);
  expect(readDesignReviewMoveCoordinates(target)).not.toBeNull();
  expect(rotations).toHaveBeenCalledWith(degrees);
});

it.each([
  '1.2.3deg',
  '.deg',
  '--1deg',
  '1e3deg',
  '1deg trailing',
  '1 0 0 30deg',
  '0 0 0 30deg',
  '9'.repeat(1024) + 'deg',
])('refuses unsupported rotation %s without changing source styles', (rotation) => {
  const parent = document.createElement('div');
  const target = document.createElement('div');
  Object.defineProperty(parent.style, 'rotate', { value: rotation });
  parent.append(target);
  document.body.append(parent);
  const before = parent.outerHTML;
  expect(readDesignReviewMoveCoordinates(target)).toBeNull();
  expect(parent.outerHTML).toBe(before);
});

function mountedTarget() {
  const parent = document.createElement('div');
  const target = document.createElement('div');
  parent.append(target);
  document.body.append(parent);
  return { parent, target };
}

function styleValue(element: HTMLElement, property: string, value: string) {
  Object.defineProperty(element.style, property, { value, configurable: true });
}

it('maps viewport deltas through ancestor rotation and scale plus target zoom', () => {
  const { parent, target } = mountedTarget();
  styleValue(parent, 'rotate', '90deg');
  styleValue(parent, 'scale', '2 3 1');
  styleValue(target, 'zoom', '2');
  styleValue(target, 'rotate', '40deg');
  styleValue(target, 'scale', '7');
  const before = parent.outerHTML;
  const coordinates = readDesignReviewMoveCoordinates(target);
  const point = coordinates?.toLocal({ x: -18, y: 8 });
  expect(point?.x).toBeCloseTo(2, 8);
  expect(point?.y).toBeCloseTo(3, 8);
  expect(parent.outerHTML).toBe(before);
});

it('maps a planar transform without including its positional translation', () => {
  const { parent, target } = mountedTarget();
  parent.style.transform = 'matrix(2,0,0,4,100,200)';
  expect(readDesignReviewMoveCoordinates(target)?.toLocal({ x: 6, y: 20 })).toEqual({ x: 3, y: 5 });
});

it.each([
  ['zoom', '0'],
  ['zoom', '-1'],
  ['zoom', 'invalid'],
  ['perspective', '100px'],
  ['offsetPath', 'path("M 0 0 L 1 1")'],
  ['scale', '1 2 3 4'],
  ['scale', '1 invalid'],
  ['scale', '1 1 2'],
  ['scale', '0'],
  ['transform', 'matrix3d(unsupported)'],
])('refuses %s=%s and recovers after the unsupported style is removed', (property, value) => {
  const { parent, target } = mountedTarget();
  styleValue(parent, property, value);
  const before = parent.outerHTML;
  expect(readDesignReviewMoveCoordinates(target)).toBeNull();
  expect(parent.outerHTML).toBe(before);
  styleValue(parent, property, '');
  expect(readDesignReviewMoveCoordinates(target)?.toLocal({ x: 4, y: -3 })).toEqual({
    x: 4,
    y: -3,
  });
});

it('invalidates gesture coordinates after geometry or composed ancestry changes', () => {
  const { parent, target } = mountedTarget();
  const initial = readDesignReviewMoveCoordinates(target)!;
  expect(initial.matches(readDesignReviewMoveCoordinates(target))).toBe(true);
  expect(initial.matches(null)).toBe(false);
  styleValue(parent, 'scale', '2');
  expect(initial.matches(readDesignReviewMoveCoordinates(target))).toBe(false);
  styleValue(parent, 'scale', '1');
  const replacement = document.createElement('div');
  document.body.append(replacement);
  replacement.append(target);
  expect(initial.matches(readDesignReviewMoveCoordinates(target))).toBe(false);
  replacement.remove();
  expect(readDesignReviewMoveCoordinates(target)).toBeNull();
});

it('includes a shadow host and assigned slot in the composed coordinate chain', () => {
  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'open' });
  const slot = document.createElement('slot');
  shadow.append(slot);
  const target = document.createElement('div');
  host.append(target);
  document.body.append(host);
  styleValue(host, 'scale', '2');
  expect(readDesignReviewMoveCoordinates(target)?.ancestors).toEqual([
    slot,
    host,
    document.body,
    document.documentElement,
  ]);
  expect(readDesignReviewMoveCoordinates(target)?.toLocal({ x: 8, y: 6 })).toEqual({ x: 4, y: 3 });
});

it('maps accessible frame viewport scaling and refuses rotated or collapsed frames', () => {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const target = frame.contentDocument!.createElement('div');
  frame.contentDocument!.body.append(target);
  vi.spyOn(frame.contentWindow!, 'getComputedStyle').mockImplementation((element) => {
    return element === target ? target.style : frame.contentDocument!.body.style;
  });
  Object.defineProperties(frame, { offsetWidth: { value: 100 }, offsetHeight: { value: 50 } });
  vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 150));
  expect(readDesignReviewMoveCoordinates(target)?.toLocal({ x: 8, y: 9 })).toEqual({ x: 4, y: 3 });
  styleValue(frame, 'rotate', '10deg');
  expect(readDesignReviewMoveCoordinates(target)).toBeNull();
  styleValue(frame, 'rotate', 'none');
  vi.mocked(frame.getBoundingClientRect).mockReturnValue(new DOMRect(0, 0, 0, 0));
  expect(readDesignReviewMoveCoordinates(target)).toBeNull();
});
