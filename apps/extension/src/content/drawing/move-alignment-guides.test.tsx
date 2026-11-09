// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { DrawingMoveAlignmentGuides } from './move-alignment-guides';

it('projects and deduplicates solid crosses without changing the dashed guides', () => {
  const host = new DOMParser().parseFromString(
    renderToStaticMarkup(
      <DrawingMoveAlignmentGuides
        layer={7}
        projection={{ x: 10, y: 100 }}
        guides={[
          {
            axis: 'x',
            coordinate: 30,
            from: 100,
            to: 300,
            points: [
              { x: 30, y: 120 },
              { x: 30, y: 220 },
            ],
          },
          { axis: 'y', coordinate: 120, from: 10, to: 80, points: [{ x: 30, y: 120 }] },
        ]}
      />
    ),
    'text/html'
  );
  expect(host.querySelector('svg')?.style.pointerEvents).toBe('none');
  expect(host.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  expect(host.querySelectorAll('line')).toHaveLength(2);
  expect(host.querySelector('line')?.getAttribute('stroke-dasharray')).toBe('4 3');
  const markers = host.querySelectorAll('path');
  expect(markers).toHaveLength(2);
  expect(markers[0]?.getAttribute('d')).toBe('M 16 16 L 24 24 M 24 16 L 16 24');
  expect(markers[1]?.getAttribute('d')).toBe('M 16 116 L 24 124 M 24 116 L 16 124');
  expect(markers[0]?.hasAttribute('stroke-dasharray')).toBe(false);
  expect(markers[0]?.getAttribute('stroke-width')).toBe('1');
});

it('does not render markers without an active match', () => {
  expect(
    renderToStaticMarkup(
      <DrawingMoveAlignmentGuides layer={7} projection={{ x: 0, y: 0 }} guides={[]} />
    )
  ).toBe('');
});
