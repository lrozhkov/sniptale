// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { DrawingAlignmentGuide } from './move-alignment';
import { DrawingMoveAlignmentGuides } from './move-alignment-guides';

function render(guides: DrawingAlignmentGuide[]) {
  return new DOMParser().parseFromString(
    renderToStaticMarkup(
      <DrawingMoveAlignmentGuides
        layer={7}
        projection={{ x: 10, y: 100 }}
        feedback={{ guides, relations: [], acceptedByAxis: {} }}
      />
    ),
    'text/html'
  );
}
const target = {
  id: 'dom',
  kind: 'dom' as const,
  bounds: { x: 10, y: 100, width: 40, height: 40 },
  showBounds: true,
};
const center = { kind: 'center' as const, point: { x: 30, y: 120 } };
function guide(axis: 'x' | 'y', source = center): DrawingAlignmentGuide {
  return {
    axis,
    coordinate: center.point[axis],
    from: axis === 'x' ? 100 : 10,
    to: axis === 'x' ? 300 : 80,
    points: [],
    matches: [{ target, source, anchor: center }],
  };
}
it('projects one hollow diagonal-eight diamond and geometrically gaps the accepted center guide', () => {
  const host = render([guide('x', { ...center, point: { x: 30, y: 220 } })]);
  expect(host.querySelector('svg')?.style.pointerEvents).toBe('none');
  expect(host.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  const lines = [...host.querySelectorAll('line')];
  expect(lines).toHaveLength(2);
  expect(lines.map((line) => [line.getAttribute('y1'), line.getAttribute('y2')])).toEqual([
    ['0', '14'],
    ['26', '200'],
  ]);
  expect(lines[0]?.getAttribute('stroke')).toBe('var(--sniptale-color-canvas-magnet)');
  expect(lines[0]?.getAttribute('stroke-dasharray')).toBe('4 3');
  const marker = host.querySelector('path');
  expect(marker?.getAttribute('d')).toBe('M 20 16 L 24 20 L 20 24 L 16 20 Z');
  expect(marker?.getAttribute('fill')).toBe('none');
  expect(marker?.getAttribute('stroke-width')).toBe('1.2');
  expect(host.querySelectorAll('polyline')).toHaveLength(2);
});
it('uses one filled marker and four gapped segments only for an exact shared center', () => {
  const host = render([guide('x'), guide('y')]);
  expect(host.querySelectorAll('path')).toHaveLength(1);
  expect(host.querySelector('path')?.getAttribute('data-filled')).toBe('true');
  expect(host.querySelectorAll('line')).toHaveLength(4);
  expect(host.querySelectorAll('polyline')).toHaveLength(4);
});
it('does not turn different targets crossing into a shared point or outline visible targets', () => {
  const x = guide('x', { ...center, point: { x: 30, y: 220 } });
  const y = guide('y', { ...center, point: { x: 50, y: 120 } });
  y.matches = (y.matches ?? []).map((match) => ({
    ...match,
    target: { ...target, id: 'other', showBounds: false },
  }));
  const host = render([x, y]);
  expect(host.querySelector('path')?.getAttribute('data-filled')).toBe('false');
  expect(host.querySelectorAll('rect')).toHaveLength(0);
  expect(host.querySelectorAll('polyline')).toHaveLength(2);
});
it('does not mark accepted edges or inactive matches', () => {
  const edge = guide('x');
  edge.matches = (edge.matches ?? []).map((match) => ({
    ...match,
    source: { ...center, kind: 'edge' },
    anchor: { ...center, kind: 'edge' },
  }));
  expect(render([edge]).querySelectorAll('path')).toHaveLength(0);
  expect(
    renderToStaticMarkup(
      <DrawingMoveAlignmentGuides
        layer={7}
        projection={{ x: 0, y: 0 }}
        feedback={{ guides: [], relations: [], acceptedByAxis: {} }}
      />
    )
  ).toBe('');
});

it('renders relation-only measured spans with no fabricated coordinate guide or diamond', () => {
  const feedback = {
    guides: [],
    acceptedByAxis: { x: 'gap' },
    relations: [
      {
        kind: 'gap' as const,
        mode: 'center' as const,
        axis: 'x' as const,
        key: 'gap',
        value: 20,
        spans: [
          { from: { x: 20, y: 120 }, to: { x: 40, y: 120 }, participantIds: ['a', 's'] },
          { from: { x: 80, y: 120 }, to: { x: 100, y: 120 }, participantIds: ['s', 'b'] },
        ],
      },
    ],
  };
  const host = new DOMParser().parseFromString(
    renderToStaticMarkup(
      <DrawingMoveAlignmentGuides layer={7} projection={{ x: 10, y: 100 }} feedback={feedback} />
    ),
    'text/html'
  );
  expect(host.querySelectorAll('[data-axis]')).toHaveLength(0);
  expect(host.querySelectorAll('[data-ui="content.drawing.alignment-marker"]')).toHaveLength(0);
  const paths = [...host.querySelectorAll('[data-relation-kind="gap"]')];
  expect(paths).toHaveLength(2);
  expect(paths[0]?.querySelector('polyline')?.getAttribute('points')).toBe('10,20 30,20');
  expect(paths[0]?.querySelector('polyline')?.getAttribute('stroke')).toBe(
    'var(--sniptale-color-canvas-magnet)'
  );
});
