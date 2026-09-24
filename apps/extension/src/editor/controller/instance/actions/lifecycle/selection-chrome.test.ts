// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { Control } from 'fabric';
import { patchEdgeControl } from '../../../document/interaction-border-controls';
import {
  disposeEditorSelectionChrome,
  mountEditorSelectionChrome,
  resolveSelectionChromeMetrics,
} from './selection-chrome';

it('keeps selection controls bounded in screen pixels across editor zoom', () => {
  expect(resolveSelectionChromeMetrics(4)).toMatchObject({
    cornerRadius: 8.125,
    borderWidth: 1.35,
    guideWidth: 1,
  });
  expect(resolveSelectionChromeMetrics(0.2)).toMatchObject({
    cornerRadius: 4.875,
    borderWidth: 1.35,
    guideWidth: 1,
  });
});

it('renders selection and magnet as sharp vectors while preserving the Fabric hit surface', () => {
  const container = document.createElement('div');
  const upperCanvasEl = document.createElement('canvas');
  container.appendChild(upperCanvasEl);
  let displayedWidth = 400;
  upperCanvasEl.getBoundingClientRect = () => ({ width: displayedWidth }) as DOMRect;
  const object = {
    borderColor: '#2563eb',
    cornerColor: '#fff',
    cornerStrokeColor: '#2563eb',
    hasBorders: true,
    hasControls: true,
    borderDashArray: null,
    getCoords: () => [
      { x: 10, y: 10 },
      { x: 30, y: 10 },
      { x: 30, y: 30 },
      { x: 10, y: 30 },
    ],
    calcOCoords: () => ({ tl: { x: 10, y: 10 } }),
    setCoords: () => {},
    controls: { tl: { offsetX: 0, offsetY: 0, sizeX: 13, sizeY: 13 } },
    isControlVisible: () => true,
  };
  let render: (() => void) | undefined;
  const canvas = {
    upperCanvasEl,
    getWidth: () => 100,
    getHeight: () => 100,
    getActiveObject: () => object,
    on: (_event: string, handler: () => void) => {
      render = handler;
      return () => {
        render = undefined;
      };
    },
  };
  const magnet = {
    getVisualGuides: () => ({
      lines: [{ origin: { x: 1, y: 2 }, target: { x: 50, y: 2 } }],
      points: [],
    }),
  };

  mountEditorSelectionChrome(canvas as never, magnet as never);
  const svg = container.querySelector('svg')!;
  expect(canvas).toHaveProperty('skipControlsDrawing', true);
  expect(svg.getAttribute('viewBox')).toBe('0 0 100 100');
  expect(svg.querySelector('polygon')?.getAttribute('vector-effect')).toBe('non-scaling-stroke');
  expect(svg.querySelector('line')?.getAttribute('vector-effect')).toBe('non-scaling-stroke');
  expect(Number(svg.querySelector('circle')?.getAttribute('r')) * 4).toBeCloseTo(8.125);
  expect(object.controls.tl).toHaveProperty('sizeX', 5);

  displayedWidth = 20;
  render?.();
  expect(Number(svg.querySelector('circle')?.getAttribute('r')) * 0.2).toBeCloseTo(4.875);
  expect(object.controls.tl).toHaveProperty('sizeX', 100);
  disposeEditorSelectionChrome(canvas as never);
  expect(container.querySelector('svg')).toBeNull();
  expect(canvas).toHaveProperty('skipControlsDrawing', false);
  expect(object.controls.tl).toHaveProperty('sizeX', 13);
});

it('shows visible custom and rotation controls, point guides, and clears stale selection', () => {
  const container = document.createElement('div');
  const upperCanvasEl = document.createElement('canvas');
  container.appendChild(upperCanvasEl);
  upperCanvasEl.getBoundingClientRect = () => ({ width: 100 }) as DOMRect;
  const hiddenEdge = new Control();
  patchEdgeControl(hiddenEdge, 'mt');
  const object = {
    hasBorders: true,
    hasControls: true,
    borderDashArray: [4, 3],
    borderColor: '#2563eb',
    cornerColor: '#fff',
    cornerStrokeColor: '#2563eb',
    cornerSize: 13,
    getCoords: () => [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
    ],
    controls: {
      tl: { sizeX: 13, sizeY: 13, offsetX: 0, offsetY: 0 },
      mt: hiddenEdge,
      ml: { sizeX: 20, sizeY: 20, offsetX: 0, offsetY: 0 },
      mtr: { sizeX: 22, sizeY: 22, offsetX: 0, offsetY: -32 },
      start: { sizeX: 20, sizeY: 20, offsetX: 0, offsetY: 0 },
      end: { sizeX: 20, sizeY: 20, offsetX: 0, offsetY: 0 },
    },
    calcOCoords: () => ({
      tl: { x: 0, y: 0 },
      mt: { x: 10, y: 0 },
      ml: { x: 0, y: 10 },
      mtr: { x: 10, y: -32 },
      start: { x: 3, y: 4 },
      end: { x: NaN, y: 4 },
    }),
    setCoords: () => {},
    isControlVisible: (key: string) => key !== 'tl',
  };
  let selected: typeof object | null = object;
  let render: (() => void) | undefined;
  let logicalWidth = 100;
  let logicalHeight = 100;
  const canvas = {
    upperCanvasEl,
    getWidth: () => logicalWidth,
    getHeight: () => logicalHeight,
    getActiveObject: () => selected,
    on: (_event: string, handler: () => void) => {
      render = handler;
      return () => {};
    },
  };
  const magnet = { getVisualGuides: () => ({ lines: [], points: [{ x: 5, y: 6 }] }) };
  mountEditorSelectionChrome(canvas as never, magnet as never);
  const svg = container.querySelector('svg')!;
  expect(svg.querySelector('polygon')?.getAttribute('stroke-dasharray')).toBe('4 3');
  expect(svg.querySelector('g path')).not.toBeNull();
  expect(svg.querySelectorAll('circle')).toHaveLength(2);
  expect(svg.querySelectorAll('path')).toHaveLength(2);

  selected = null;
  render?.();
  expect(svg.querySelector('polygon')).toBeNull();
  expect(svg.querySelectorAll('path')).toHaveLength(1);
  logicalWidth = 0;
  logicalHeight = 0;
  render?.();
  expect(svg.querySelectorAll('path')).toHaveLength(1);
  disposeEditorSelectionChrome(canvas as never);
  expect(object.controls.mtr).toHaveProperty('offsetY', -32);
});

it('does not replace Fabric controls when its canvas wrapper is unavailable', () => {
  const canvas = { upperCanvasEl: document.createElement('canvas') };
  mountEditorSelectionChrome(
    canvas as never,
    { getVisualGuides: () => ({ lines: [], points: [] }) } as never
  );
  expect(canvas).not.toHaveProperty('skipControlsDrawing');
});
