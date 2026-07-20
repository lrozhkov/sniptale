// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  createAnnotationArrow,
  createAnnotationPath,
  createAnnotationRectangle,
  createVideoAnnotationsOverlay,
} from './svg';

describe('video annotations svg helpers', () => {
  it('builds an overlay with a reusable arrowhead marker', () => {
    const overlay = createVideoAnnotationsOverlay();

    expect(overlay.tagName).toBe('svg');
    expect(overlay.querySelector('marker#arrowhead')).not.toBeNull();
    expect(overlay.querySelector('polygon')?.getAttribute('fill')).toBeTruthy();
  });

  it('builds rectangle and arrow elements with annotation metadata', () => {
    const rectangle = createAnnotationRectangle(40, 30, -10, 20);
    const arrow = createAnnotationArrow(10, 20, 30, 40);

    expect(rectangle.getAttribute('x')).toBe('30');
    expect(rectangle.getAttribute('height')).toBe('20');
    expect(rectangle.getAttribute('data-annotation-id')).toContain('annotation-');
    expect(arrow.getAttribute('marker-end')).toBe('url(#arrowhead)');
    expect(arrow.getAttribute('data-created-at')).toBeTruthy();
  });

  it('guards path creation and emits bezier segments for multi-point curves', () => {
    expect(() => createAnnotationPath([{ x: 10, y: 20 }])).toThrow(
      'Need at least 2 points for path'
    );

    const path = createAnnotationPath([
      { x: 10, y: 20 },
      { x: 20, y: 30 },
      { x: 30, y: 40 },
    ]);

    expect(path.getAttribute('d')).toContain('C');
    expect(path.getAttribute('stroke-linecap')).toBe('round');
  });

  it('creates a direct line path when only two points are provided', () => {
    const path = createAnnotationPath([
      { x: 5, y: 6 },
      { x: 15, y: 16 },
    ]);

    expect(path.getAttribute('d')).toBe('M 5 6 L 15 16');
  });
});
