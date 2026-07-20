import { beforeEach, expect, it, vi } from 'vitest';

import type { ScenarioAIAnnotation } from '../../../../contracts/ai/scenario';
import { createScenarioOverlayFromAIAnnotation, summarizeScenarioOverlay } from './overlays';

beforeEach(() => {
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-1111-1111-111111111111');
});

it('maps every supported AI annotation tool onto a deterministic overlay shape', () => {
  const annotations: ScenarioAIAnnotation[] = [
    { tool: 'focus-rect', rect: { x: 10, y: 20, width: 30, height: 40 } },
    { tool: 'click-ring', point: { x: 12, y: 24 } },
    { tool: 'cursor', point: { x: 18, y: 28 } },
    { tool: 'arrow', start: { x: 1, y: 2 }, end: { x: 3, y: 4 } },
    { tool: 'rectangle', rect: { x: 20, y: 30, width: 40, height: 50 } },
    { tool: 'ellipse', rect: { x: 25, y: 35, width: 45, height: 55 } },
    { tool: 'text', point: { x: 6, y: 7 }, text: 'Click here' },
    { tool: 'blur-rect', rect: { x: 22, y: 12, width: 70, height: 18 } },
  ];

  const overlays = annotations.map((annotation) =>
    createScenarioOverlayFromAIAnnotation(annotation)
  );

  expect(overlays).toEqual([
    expect.objectContaining({ kind: 'focus-rect', rect: { x: 10, y: 20, width: 30, height: 40 } }),
    expect.objectContaining({ kind: 'click-ring', point: { x: 12, y: 24 } }),
    expect.objectContaining({ kind: 'cursor', point: { x: 18, y: 28 } }),
    expect.objectContaining({
      kind: 'arrow',
      start: { x: 1, y: 2 },
      end: { x: 3, y: 4 },
      id: '11111111-1111-1111-1111-111111111111',
    }),
    expect.objectContaining({ kind: 'rectangle', rect: { x: 20, y: 30, width: 40, height: 50 } }),
    expect.objectContaining({ kind: 'ellipse', rect: { x: 25, y: 35, width: 45, height: 55 } }),
    expect.objectContaining({
      kind: 'text',
      point: { x: 6, y: 7 },
      text: 'Click here',
      fontFamily: 'system-ui',
    }),
    expect.objectContaining({ kind: 'blur-rect', rect: { x: 22, y: 12, width: 70, height: 18 } }),
  ]);
});

it('drops empty text annotations', () => {
  expect(
    createScenarioOverlayFromAIAnnotation({
      tool: 'text',
      point: { x: 5, y: 8 },
      text: '   ',
    })
  ).toBeNull();
});

it('summarizes rect, point, and arrow overlay families', () => {
  expect(
    summarizeScenarioOverlay({
      id: 'overlay-id',
      kind: 'focus-rect',
      rect: { x: 11, y: 12, width: 13, height: 14 },
    })
  ).toEqual({
    kind: 'focus-rect',
    rect: { x: 11, y: 12, width: 13, height: 14 },
  });

  expect(
    summarizeScenarioOverlay({
      id: 'overlay-id',
      kind: 'click-ring',
      point: { x: 7, y: 8 },
    })
  ).toEqual({
    kind: 'click-ring',
    point: { x: 7, y: 8 },
  });

  expect(
    summarizeScenarioOverlay({
      id: '11111111-1111-1111-1111-111111111111',
      kind: 'arrow',
      start: { x: 1, y: 2 },
      end: { x: 3, y: 4 },
      color: '#f97316',
      strokeWidth: 6,
    })
  ).toEqual({
    kind: 'arrow',
    start: { x: 1, y: 2 },
    end: { x: 3, y: 4 },
  });
});

it('summarizes text overlays', () => {
  expect(
    summarizeScenarioOverlay({
      id: '11111111-1111-1111-1111-111111111111',
      kind: 'text',
      point: { x: 9, y: 10 },
      text: 'CTA',
      color: '#111827',
      fontFamily: 'system-ui',
      fontSize: 24,
      fontWeight: 600,
    })
  ).toEqual({
    kind: 'text',
    point: { x: 9, y: 10 },
    text: 'CTA',
  });
});
