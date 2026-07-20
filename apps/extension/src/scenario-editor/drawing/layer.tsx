import type { ScenarioDrawingDocument, ScenarioDrawingMark } from './types';

function renderMark(mark: ScenarioDrawingMark) {
  switch (mark.kind) {
    case 'shape':
      if (mark.shape === 'ellipse') {
        return (
          <ellipse
            key={mark.id}
            cx={mark.frame.x + mark.frame.width / 2}
            cy={mark.frame.y + mark.frame.height / 2}
            fill={mark.style.fillColor}
            opacity={mark.style.opacity}
            rx={mark.frame.width / 2}
            ry={mark.frame.height / 2}
            stroke={mark.style.color}
            strokeWidth={mark.style.width}
          />
        );
      }

      return (
        <rect
          key={mark.id}
          fill={mark.style.fillColor}
          height={mark.frame.height}
          opacity={mark.style.opacity}
          rx={10}
          stroke={mark.style.color}
          strokeWidth={mark.style.width}
          width={mark.frame.width}
          x={mark.frame.x}
          y={mark.frame.y}
        />
      );
    case 'stroke':
      return (
        <path
          key={mark.id}
          d={mark.points
            .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
            .join(' ')}
          fill="none"
          opacity={mark.style.opacity}
          stroke={mark.style.color}
          strokeLinecap={mark.style.lineCap}
          strokeLinejoin={mark.style.lineJoin}
          strokeWidth={mark.style.width}
        />
      );
  }
}

export function ScenarioDrawingLayer(props: {
  document: ScenarioDrawingDocument;
  height: number;
  width: number;
}) {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      data-ui="scenario.drawing.layer"
      height={props.height}
      viewBox={`0 0 ${props.width} ${props.height}`}
      width={props.width}
    >
      <g data-scenario-drawing-slide-id={props.document.slideId}>
        {props.document.marks.map(renderMark)}
      </g>
    </svg>
  );
}
