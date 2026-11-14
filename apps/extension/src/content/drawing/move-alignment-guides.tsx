import {
  resolveDrawingAlignmentFeedback,
  type DrawingPoint,
  type DrawingSnapFeedback,
} from '../../features/drawing/public';

export function DrawingMoveAlignmentGuides(props: {
  feedback: DrawingSnapFeedback;
  projection: DrawingPoint;
  layer: number;
}) {
  if (!props.feedback.guides.length && !props.feedback.relations.length) return null;
  const feedback = resolveDrawingAlignmentFeedback(
    props.feedback.guides,
    1,
    props.feedback.relations
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
      {feedback.lines.map((guide, index) => (
        <line
          key={`${guide.axis}:${guide.coordinate}:${index}`}
          data-axis={guide.axis}
          x1={(guide.axis === 'x' ? guide.coordinate : guide.from) - props.projection.x}
          x2={(guide.axis === 'x' ? guide.coordinate : guide.to) - props.projection.x}
          y1={(guide.axis === 'y' ? guide.coordinate : guide.from) - props.projection.y}
          y2={(guide.axis === 'y' ? guide.coordinate : guide.to) - props.projection.y}
          stroke="var(--sniptale-color-canvas-magnet)"
          strokeWidth={1}
          strokeDasharray="4 3"
        />
      ))}
      {feedback.measurements.map((measurement) => (
        <g
          key={measurement.key}
          data-relation-kind={measurement.kind}
          data-relation-axis={measurement.axis}
          data-relation-key={measurement.key}
        >
          {measurement.segments.map((segment, index) => (
            <polyline
              key={index}
              points={segment
                .map((point) => `${point.x - props.projection.x},${point.y - props.projection.y}`)
                .join(' ')}
              fill="none"
              stroke="var(--sniptale-color-canvas-magnet)"
              strokeWidth={1}
            />
          ))}
          {measurement.label ? (
            <text
              x={measurement.label.point.x - props.projection.x}
              y={measurement.label.point.y - props.projection.y}
              textAnchor={measurement.label.anchor}
              fontSize={10}
              fill="var(--sniptale-color-canvas-magnet)"
              stroke="var(--sniptale-color-surface-panel)"
              strokeWidth={3}
              paintOrder="stroke"
            >
              {measurement.label.text}
            </text>
          ) : null}
        </g>
      ))}
      {feedback.brackets.map((points, index) => (
        <polyline
          key={`bracket:${index}`}
          data-ui="content.drawing.alignment-bracket"
          points={points
            .map((point) => `${point.x - props.projection.x},${point.y - props.projection.y}`)
            .join(' ')}
          fill="none"
          stroke="var(--sniptale-color-canvas-magnet)"
          strokeWidth={1}
        />
      ))}
      {feedback.markers.map((point) => {
        const x = point.x - props.projection.x;
        const y = point.y - props.projection.y;
        return (
          <path
            key={`${point.x}:${point.y}`}
            data-ui="content.drawing.alignment-marker"
            data-filled={point.filled}
            d={`M ${x} ${y - 4} L ${x + 4} ${y} L ${x} ${y + 4} L ${x - 4} ${y} Z`}
            fill={point.filled ? 'var(--sniptale-color-canvas-magnet)' : 'none'}
            stroke="var(--sniptale-color-canvas-magnet)"
            strokeWidth={1.2}
          />
        );
      })}
    </svg>
  );
}
