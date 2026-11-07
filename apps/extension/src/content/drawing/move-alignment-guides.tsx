import type { DrawingPoint } from '../../features/drawing/public';
import type { DrawingAlignmentGuide } from './move-alignment';

export function DrawingMoveAlignmentGuides(props: {
  guides: readonly DrawingAlignmentGuide[];
  projection: DrawingPoint;
  layer: number;
}) {
  if (!props.guides.length) return null;
  const points = new Map(
    props.guides.flatMap((guide) =>
      guide.points.map((point) => [`${point.x}:${point.y}`, point] as const)
    )
  );
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
      {[...points].map(([key, point]) => {
        const x = point.x - props.projection.x;
        const y = point.y - props.projection.y;
        return (
          <path
            key={key}
            data-ui="content.drawing.alignment-marker"
            d={`M ${x - 4} ${y - 4} L ${x + 4} ${y + 4} M ${x + 4} ${y - 4} L ${x - 4} ${y + 4}`}
            fill="none"
            stroke="var(--sniptale-color-accent)"
            strokeWidth={1}
          />
        );
      })}
    </svg>
  );
}
