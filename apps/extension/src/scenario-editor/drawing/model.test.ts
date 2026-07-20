import { expect, it } from 'vitest';
import { createEmptyScenarioDrawingDocument, isScenarioDrawingDocumentEmpty } from './model';
import { renderScenarioDrawingSvg } from './svg';
import type { ScenarioDrawingDocument } from './types';

it('keeps future annotation state outside normal scenario elements', () => {
  const document = createEmptyScenarioDrawingDocument('slide-1');

  expect(document).toEqual({ marks: [], slideId: 'slide-1', version: 1 });
  expect(isScenarioDrawingDocumentEmpty(document)).toBe(true);
});

it('renders headless stroke data as svg markup', () => {
  const document: ScenarioDrawingDocument = {
    marks: [
      {
        id: 'stroke-1',
        kind: 'stroke',
        points: [
          { x: 12, y: 24 },
          { x: 42, y: 54 },
        ],
        style: {
          color: '#f97316',
          lineCap: 'round',
          lineJoin: 'round',
          opacity: 0.84,
          width: 6,
        },
        tool: 'freehand',
      },
    ],
    slideId: 'slide-1',
    version: 1,
  };

  expect(renderScenarioDrawingSvg(document)).toContain('M 12 24 L 42 54');
  expect(renderScenarioDrawingSvg(document)).toContain('stroke="#f97316"');
});

it('renders headless shape data without depending on toolbar state', () => {
  const document: ScenarioDrawingDocument = {
    marks: [
      {
        frame: { height: 60, width: 120, x: 20, y: 30 },
        id: 'shape-1',
        kind: 'shape',
        shape: 'rectangle',
        style: {
          color: '#2563eb',
          fillColor: 'transparent',
          lineCap: 'round',
          lineJoin: 'round',
          opacity: 1,
          width: 3,
        },
      },
      {
        frame: { height: 40, width: 80, x: 180, y: 90 },
        id: 'shape-2',
        kind: 'shape',
        shape: 'ellipse',
        style: {
          color: '#16a34a',
          fillColor: 'rgba(22, 163, 74, 0.12)',
          lineCap: 'round',
          lineJoin: 'round',
          opacity: 0.72,
          width: 2,
        },
      },
    ],
    slideId: 'slide-1',
    version: 1,
  };

  const svg = renderScenarioDrawingSvg(document);

  expect(svg).toContain('<rect');
  expect(svg).toContain('<ellipse');
  expect(svg).toContain('fill="transparent"');
  expect(svg).toContain('fill="rgba(22, 163, 74, 0.12)"');
});
