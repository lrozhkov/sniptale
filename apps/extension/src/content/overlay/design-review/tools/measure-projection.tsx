import { placeMeasureGuideLabel } from './measure-model';
import type { MeasureModel } from './measure';

export function DesignReviewMeasureProjection(props: { model: MeasureModel; active: boolean }) {
  if (!props.active) return null;
  const { model } = props;
  const { rects, lines, badges, labelObstacles } = readProjectionGeometry(model);
  return (
    <svg
      aria-hidden="true"
      data-ui="content.design-review.measure-projection"
      data-floating-ui-capture-transient="true"
      className="pointer-events-none fixed inset-0 z-[2147483645] overflow-hidden"
      width="100%"
      height="100%"
    >
      {rects.map((rect, index) =>
        rect ? (
          <MeasureTargetOutline key={index} rect={rect} index={index} badge={badges[index]} />
        ) : null
      )}
      {lines.map((line, index) => {
        const points = { x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2 };
        const label = placeMeasureGuideLabel(
          {
            ...line,
            ...(lines.length > 1
              ? { axis: line.x1 === line.x2 ? ('y' as const) : ('x' as const) }
              : {}),
          },
          labelObstacles,
          { width: window.innerWidth, height: window.innerHeight }
        );
        if (label)
          labelObstacles.push({
            x: label.left,
            y: label.top,
            width: label.width,
            height: label.height,
          });
        return (
          <g key={index}>
            <line {...points} stroke="white" strokeWidth={3} />
            <line {...points} stroke="#111827" strokeWidth={1} />
            {label ? (
              <>
                <line
                  x1={label.anchorX}
                  y1={label.anchorY}
                  x2={label.left + label.width / 2}
                  y2={label.top + label.height / 2}
                  stroke="#111827"
                  strokeWidth={1}
                  strokeDasharray="2 2"
                />
                <rect
                  data-ui="content.design-review.measure-guide-label"
                  x={label.left}
                  y={label.top}
                  width={label.width}
                  height={label.height}
                  rx={3}
                  fill="#111827"
                />
                <text
                  x={label.left + label.width / 2}
                  y={label.top + 14}
                  textAnchor="middle"
                  fill="white"
                  fontSize={11}
                  fontFamily="var(--sniptale-font-interface)"
                >
                  {label.text}
                </text>
              </>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function readProjectionGeometry(model: MeasureModel) {
  const rects = [model.rectA, model.rectB];
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number; value: number }> = [];
  if (model.kind === 'ready') {
    const { rectA: a, rectB: b, geometry: g } = model;
    if (g.gapX > 0) {
      const left = a.x + a.width <= b.x ? a : b,
        right = left === a ? b : a;
      const y =
        g.overlapY > 0
          ? (Math.max(a.y, b.y) + Math.min(a.y + a.height, b.y + b.height)) / 2
          : (a.y + a.height / 2 + b.y + b.height / 2) / 2;
      lines.push({ x1: left.x + left.width, y1: y, x2: right.x, y2: y, value: g.gapX });
    }
    if (g.gapY > 0) {
      const top = a.y + a.height <= b.y ? a : b,
        bottom = top === a ? b : a;
      const x =
        g.overlapX > 0
          ? (Math.max(a.x, b.x) + Math.min(a.x + a.width, b.x + b.width)) / 2
          : (a.x + a.width / 2 + b.x + b.width / 2) / 2;
      lines.push({ x1: x, y1: top.y + top.height, x2: x, y2: bottom.y, value: g.gapY });
    }
  }
  const badges = rects.map((rect) =>
    rect &&
    rect.x + rect.width > 0 &&
    rect.x < window.innerWidth &&
    rect.y + rect.height > 68 &&
    rect.y < window.innerHeight
      ? {
          x: Math.max(4, Math.min(rect.x, window.innerWidth - 24)),
          y: Math.max(68, Math.min(rect.y - 22, window.innerHeight - 22)),
          width: 20,
          height: 18,
        }
      : null
  );
  const labelObstacles = [
    ...rects.filter((rect): rect is NonNullable<typeof rect> => Boolean(rect)),
    ...badges.filter((badge): badge is NonNullable<typeof badge> => Boolean(badge)),
  ];
  return { rects, lines, badges, labelObstacles };
}

function MeasureTargetOutline({
  rect,
  index,
  badge,
}: {
  rect: NonNullable<MeasureModel['rectA']>;
  index: number;
  badge: { x: number; y: number } | null | undefined;
}) {
  return (
    <g>
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        fill="none"
        stroke="white"
        strokeWidth={3}
      />
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        fill="none"
        stroke="#111827"
        strokeWidth={1}
        strokeDasharray={index ? '4 3' : undefined}
      />
      <rect
        data-ui="content.design-review.measure-target-label"
        x={badge?.x ?? -100}
        y={badge?.y ?? -100}
        width={20}
        height={18}
        rx={3}
        fill="#111827"
      />
      <text
        x={(badge?.x ?? -100) + 10}
        y={(badge?.y ?? -100) + 13}
        textAnchor="middle"
        fill="white"
        fontSize={11}
        fontFamily="var(--sniptale-font-interface)"
      >
        {index ? 'B' : 'A'}
      </text>
    </g>
  );
}
