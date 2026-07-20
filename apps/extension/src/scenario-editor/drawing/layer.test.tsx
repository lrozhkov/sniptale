// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { ScenarioDrawingLayer } from './layer';
import type { ScenarioDrawingDocument, ScenarioDrawingStrokeStyle } from './types';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const strokeStyle: ScenarioDrawingStrokeStyle = {
  color: '#f97316',
  lineCap: 'round',
  lineJoin: 'round',
  opacity: 0.9,
  width: 4,
};
const shapeStyle = { ...strokeStyle, fillColor: 'transparent' };
const drawingDocument: ScenarioDrawingDocument = {
  marks: [
    {
      frame: { height: 40, width: 80, x: 10, y: 12 },
      id: 'ellipse-1',
      kind: 'shape',
      shape: 'ellipse',
      style: shapeStyle,
    },
    {
      frame: { height: 48, width: 96, x: 120, y: 40 },
      id: 'rectangle-1',
      kind: 'shape',
      shape: 'rectangle',
      style: shapeStyle,
    },
    {
      id: 'stroke-1',
      kind: 'stroke',
      points: [
        { x: 20, y: 90 },
        { x: 80, y: 132 },
      ],
      style: strokeStyle,
      tool: 'freehand',
    },
  ],
  slideId: 'slide-1',
  version: 1,
};

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

it('renders svg-oriented drawing marks without owning editor chrome', () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(<ScenarioDrawingLayer document={drawingDocument} height={720} width={1280} />);
  });

  expect(container.querySelector('[data-ui="scenario.drawing.layer"] ellipse')).not.toBeNull();
  expect(container.querySelector('[data-ui="scenario.drawing.layer"] rect')).not.toBeNull();
  expect(container.querySelector('[data-ui="scenario.drawing.layer"] path')).not.toBeNull();
  expect(container.textContent).toBe('');
});
