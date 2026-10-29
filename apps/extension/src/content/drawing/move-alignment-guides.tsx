import type { DrawingPoint } from '../../features/drawing/public';
import type { DrawingAlignmentGuide } from './move-alignment';

export function DrawingMoveAlignmentGuides(props: {
  guides: readonly DrawingAlignmentGuide[];
  projection: DrawingPoint;
  layer: number;
}) {
  if (!props.guides.length) return null;
  return (
    <svg
      data-ui="content.drawing.alignment-guides"
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: props.layer,
      }}
    >
      {props.guides.map((guide) => (
        <line
          key={guide.axis}
          data-axis={guide.axis}
          x1={(guide.axis === 'x' ? guide.coordinate : guide.from) - props.projection.x}
          x2={(guide.axis === 'x' ? guide.coordinate : guide.to) - props.projection.x}
          y1={(guide.axis === 'y' ? guide.coordinate : guide.from) - props.projection.y}
          y2={(guide.axis === 'y' ? guide.coordinate : guide.to) - props.projection.y}
          stroke="var(--sniptale-color-accent)"
          strokeWidth={1}
          strokeDasharray="4 3"
        />
      ))}
    </svg>
  );
}
