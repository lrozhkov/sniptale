export type ConnectorSide = 'top' | 'right' | 'bottom' | 'left';

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };

type Segment = {
  end: number;
  index: number;
  kind: 'arc' | 'line';
  start: number;
};

const EPSILON = 0.0001;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function getMetrics(rect: Rect, requestedRadius: number) {
  const radius = Math.min(Math.max(0, requestedRadius), rect.width / 2, rect.height / 2);
  const horizontal = Math.max(0, rect.width - 2 * radius);
  const vertical = Math.max(0, rect.height - 2 * radius);
  const arc = (Math.PI * radius) / 2;
  const lengths = [horizontal, arc, vertical, arc, horizontal, arc, vertical, arc];
  let cursor = 0;
  const segments: Segment[] = lengths.map((length, index) => {
    const start = cursor;
    cursor += length;
    return { end: cursor, index, kind: index % 2 === 0 ? 'line' : 'arc', start };
  });
  return { arc, horizontal, perimeter: Math.max(1, cursor), radius, segments, vertical };
}

function normalizeDistance(distance: number, perimeter: number) {
  const normalized = distance % perimeter;
  return normalized < 0 ? normalized + perimeter : normalized;
}

function getPointAtDistance(rect: Rect, radius: number, distance: number): Point {
  const metrics = getMetrics(rect, radius);
  const value = normalizeDistance(distance, metrics.perimeter);
  const { arc, horizontal, vertical } = metrics;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const stops = [horizontal, horizontal + arc, horizontal + arc + vertical];

  if (value <= stops[0]!) return { x: rect.x + radius + value, y: rect.y };
  if (value <= stops[1]!) {
    const angle = -Math.PI / 2 + (value - horizontal) / Math.max(radius, EPSILON);
    return {
      x: right - radius + radius * Math.cos(angle),
      y: rect.y + radius + radius * Math.sin(angle),
    };
  }
  if (value <= stops[2]!) {
    return { x: right, y: rect.y + radius + value - horizontal - arc };
  }

  const afterRight = value - horizontal - arc - vertical;
  if (afterRight <= arc) {
    const angle = afterRight / Math.max(radius, EPSILON);
    return {
      x: right - radius + radius * Math.cos(angle),
      y: bottom - radius + radius * Math.sin(angle),
    };
  }
  if (afterRight <= arc + horizontal) {
    return { x: right - radius - (afterRight - arc), y: bottom };
  }
  if (afterRight <= 2 * arc + horizontal) {
    const angle = Math.PI / 2 + (afterRight - arc - horizontal) / Math.max(radius, EPSILON);
    return {
      x: rect.x + radius + radius * Math.cos(angle),
      y: bottom - radius + radius * Math.sin(angle),
    };
  }
  if (afterRight <= 2 * arc + horizontal + vertical) {
    return {
      x: rect.x,
      y: bottom - radius - (afterRight - 2 * arc - horizontal),
    };
  }
  const angle =
    Math.PI + (afterRight - 2 * arc - horizontal - vertical) / Math.max(radius, EPSILON);
  return {
    x: rect.x + radius + radius * Math.cos(angle),
    y: rect.y + radius + radius * Math.sin(angle),
  };
}

function getSegmentAtDistance(
  segments: Segment[],
  perimeter: number,
  distance: number,
  direction: 'clockwise' | 'counterclockwise'
) {
  let cycle = Math.floor(distance / perimeter);
  let normalized = distance - cycle * perimeter;
  if (direction === 'counterclockwise' && normalized <= EPSILON) {
    cycle -= 1;
    normalized = perimeter;
  }
  const segment =
    direction === 'clockwise'
      ? (segments.find((candidate) => normalized < candidate.end - EPSILON) ?? segments[0]!)
      : ([...segments]
          .reverse()
          .find(
            (candidate) =>
              normalized > candidate.start + EPSILON && normalized <= candidate.end + EPSILON
          ) ?? segments.at(-1)!);
  return { cycle, segment };
}

function getTraversalTarget(
  fromDistance: number,
  toDistance: number,
  perimeter: number,
  direction: 'clockwise' | 'counterclockwise'
) {
  const current = normalizeDistance(fromDistance, perimeter);
  let target = normalizeDistance(toDistance, perimeter);
  if (direction === 'clockwise' && target <= current + EPSILON) target += perimeter;
  if (direction === 'counterclockwise' && target >= current - EPSILON) target -= perimeter;
  return { current, target };
}

function getCornerControls(rect: Rect): Array<Point | null> {
  return [
    null,
    { x: rect.x + rect.width, y: rect.y },
    null,
    { x: rect.x + rect.width, y: rect.y + rect.height },
    null,
    { x: rect.x, y: rect.y + rect.height },
    null,
    { x: rect.x, y: rect.y },
  ];
}

function getPathStep(args: {
  cornerControls: Array<Point | null>;
  current: number;
  direction: 'clockwise' | 'counterclockwise';
  metrics: ReturnType<typeof getMetrics>;
  rect: Rect;
  target: number;
}) {
  const { cycle, segment } = getSegmentAtDistance(
    args.metrics.segments,
    args.metrics.perimeter,
    args.current,
    args.direction
  );
  const clockwise = args.direction === 'clockwise';
  const boundary = cycle * args.metrics.perimeter + (clockwise ? segment.end : segment.start);
  const reachesBoundary = clockwise
    ? boundary < args.target - EPSILON
    : boundary > args.target + EPSILON;
  const next = reachesBoundary ? boundary : args.target;
  const point = getPointAtDistance(args.rect, args.metrics.radius, next);
  const absoluteStart = cycle * args.metrics.perimeter + segment.start;
  const absoluteEnd = cycle * args.metrics.perimeter + segment.end;
  const traversesWholeArc =
    segment.kind === 'arc' &&
    (clockwise
      ? Math.abs(args.current - absoluteStart) <= EPSILON && Math.abs(next - absoluteEnd) <= EPSILON
      : Math.abs(args.current - absoluteEnd) <= EPSILON &&
        Math.abs(next - absoluteStart) <= EPSILON);
  const cornerControl = args.cornerControls[segment.index];
  const command =
    segment.kind === 'line'
      ? 'L'
      : traversesWholeArc && cornerControl
        ? `Q ${cornerControl.x} ${cornerControl.y}`
        : `A ${args.metrics.radius} ${args.metrics.radius} 0 0 ${clockwise ? 1 : 0}`;
  return { command: `${command} ${point.x} ${point.y}`, next };
}

export function getRoundedPerimeterPath(args: {
  direction: 'clockwise' | 'counterclockwise';
  fromDistance: number;
  radius: number;
  rect: Rect;
  toDistance: number;
}) {
  const metrics = getMetrics(args.rect, args.radius);
  const traversal = getTraversalTarget(
    args.fromDistance,
    args.toDistance,
    metrics.perimeter,
    args.direction
  );
  let current = traversal.current;
  const commands: string[] = [];
  const cornerControls = getCornerControls(args.rect);
  while (Math.abs(traversal.target - current) > EPSILON) {
    const step = getPathStep({
      cornerControls,
      current,
      direction: args.direction,
      metrics,
      rect: args.rect,
      target: traversal.target,
    });
    commands.push(step.command);
    current = step.next;
  }
  return commands.join(' ');
}

type SideDistanceArgs = {
  axis: number;
  bottom: number;
  left: number;
  metrics: ReturnType<typeof getMetrics>;
  right: number;
  top: number;
};

function getTopDistance(args: SideDistanceArgs) {
  const radius = args.metrics.radius;
  if (args.axis < args.left + radius) {
    const angle = Math.acos(
      clamp((args.axis - args.left - radius) / Math.max(radius, EPSILON), -1, 0)
    );
    return args.metrics.perimeter - radius * (angle - Math.PI / 2);
  }
  if (args.axis > args.right - radius) {
    const angle = Math.asin(
      clamp((args.axis - args.right + radius) / Math.max(radius, EPSILON), 0, 1)
    );
    return args.metrics.horizontal + radius * angle;
  }
  return args.axis - args.left - radius;
}

function getRightDistance(args: SideDistanceArgs) {
  const radius = args.metrics.radius;
  if (args.axis < args.top + radius) {
    const angle = Math.acos(
      clamp((args.axis - args.top - radius) / Math.max(radius, EPSILON), -1, 0)
    );
    return args.metrics.horizontal + radius * (Math.PI - angle);
  }
  if (args.axis > args.bottom - radius) {
    const angle = Math.asin(
      clamp((args.axis - args.bottom + radius) / Math.max(radius, EPSILON), 0, 1)
    );
    return args.metrics.horizontal + args.metrics.arc + args.metrics.vertical + radius * angle;
  }
  return args.metrics.horizontal + args.metrics.arc + args.axis - args.top - radius;
}

function getBottomDistance(args: SideDistanceArgs) {
  const radius = args.metrics.radius;
  if (args.axis > args.right - radius) {
    const angle = Math.acos(
      clamp((args.axis - args.right + radius) / Math.max(radius, EPSILON), 0, 1)
    );
    return args.metrics.horizontal + args.metrics.arc + args.metrics.vertical + radius * angle;
  }
  if (args.axis < args.left + radius) {
    const angle = Math.asin(
      clamp((args.left + radius - args.axis) / Math.max(radius, EPSILON), 0, 1)
    );
    return (
      2 * args.metrics.horizontal + 2 * args.metrics.arc + args.metrics.vertical + radius * angle
    );
  }
  return (
    args.metrics.horizontal +
    2 * args.metrics.arc +
    args.metrics.vertical +
    args.right -
    radius -
    args.axis
  );
}

function getLeftDistance(args: SideDistanceArgs) {
  const radius = args.metrics.radius;
  if (args.axis > args.bottom - radius) {
    const angle = Math.acos(
      clamp((args.axis - args.bottom + radius) / Math.max(radius, EPSILON), 0, 1)
    );
    return (
      2 * args.metrics.horizontal + 2 * args.metrics.arc + args.metrics.vertical + radius * angle
    );
  }
  if (args.axis < args.top + radius) {
    const angle = Math.asin(
      clamp((args.top + radius - args.axis) / Math.max(radius, EPSILON), 0, 1)
    );
    return args.metrics.perimeter - args.metrics.arc + radius * angle;
  }
  return (
    2 * args.metrics.horizontal +
    3 * args.metrics.arc +
    args.metrics.vertical +
    args.bottom -
    radius -
    args.axis
  );
}

function getSideDistance(args: SideDistanceArgs & { side: ConnectorSide }) {
  switch (args.side) {
    case 'top':
      return getTopDistance(args);
    case 'right':
      return getRightDistance(args);
    case 'bottom':
      return getBottomDistance(args);
    case 'left':
      return getLeftDistance(args);
  }
}

function getInteriorNormal(rect: Rect, radius: number, point: Point, side: ConnectorSide) {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const cornerCenter = {
    x:
      point.x < rect.x + radius
        ? rect.x + radius
        : point.x > right - radius
          ? right - radius
          : point.x,
    y:
      point.y < rect.y + radius
        ? rect.y + radius
        : point.y > bottom - radius
          ? bottom - radius
          : point.y,
  };
  const length = Math.hypot(cornerCenter.x - point.x, cornerCenter.y - point.y);
  if (length > EPSILON) {
    return {
      x: (cornerCenter.x - point.x) / length,
      y: (cornerCenter.y - point.y) / length,
    };
  }
  return {
    top: { x: 0, y: 1 },
    right: { x: -1, y: 0 },
    bottom: { x: 0, y: -1 },
    left: { x: 1, y: 0 },
  }[side];
}

export function getRoundedSidePoint(args: {
  axis: number;
  radius: number;
  rect: Rect;
  side: ConnectorSide;
}) {
  const metrics = getMetrics(args.rect, args.radius);
  const left = args.rect.x;
  const top = args.rect.y;
  const right = left + args.rect.width;
  const bottom = top + args.rect.height;
  const horizontal = args.side === 'top' || args.side === 'bottom';
  const axis = clamp(args.axis, horizontal ? left : top, horizontal ? right : bottom);
  const radius = metrics.radius;
  const distance = getSideDistance({ axis, bottom, left, metrics, right, side: args.side, top });
  const point = getPointAtDistance(args.rect, radius, distance);
  return {
    distance,
    interiorNormal: getInteriorNormal(args.rect, radius, point, args.side),
    point,
  };
}
