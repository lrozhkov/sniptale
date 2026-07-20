import {
  Line,
  Path,
  Point,
  type FabricObject,
  type ObjectEvents,
  type PathProps,
  type SerializedPathProps,
  type TOptions,
} from 'fabric';

type ArrowPathInstance = Path<TOptions<PathProps>, SerializedPathProps, ObjectEvents>;

interface LegacyArrowGeometry {
  control: Point | null;
  end: Point;
  start: Point;
}

function getPathMoveCommand(path: ArrowPathInstance) {
  const move = path.path[0];
  return move?.[0] === 'M' ? move : null;
}

function projectPathPointToScene(path: ArrowPathInstance, x: number, y: number): Point {
  return new Point(x - path.pathOffset.x, y - path.pathOffset.y).transform(
    path.calcTransformMatrix()
  );
}

function extractStraightArrowGeometry(object: FabricObject): LegacyArrowGeometry | null {
  if (object instanceof Line) {
    const points = object.calcLinePoints();
    return {
      start: new Point(points.x1, points.y1).transform(object.calcTransformMatrix()),
      end: new Point(points.x2, points.y2).transform(object.calcTransformMatrix()),
      control: null,
    };
  }

  if (object instanceof Path && object.path.length >= 2) {
    const arrow = object as ArrowPathInstance;
    const move = getPathMoveCommand(arrow);
    const line = object.path.find((command) => command[0] === 'L');
    if (
      !move ||
      !line ||
      typeof move[1] !== 'number' ||
      typeof move[2] !== 'number' ||
      typeof line[1] !== 'number' ||
      typeof line[2] !== 'number'
    ) {
      return null;
    }

    return {
      start: projectPathPointToScene(arrow, move[1], move[2]),
      end: projectPathPointToScene(arrow, line[1], line[2]),
      control: null,
    };
  }

  return null;
}

function extractCurveArrowGeometry(object: ArrowPathInstance): LegacyArrowGeometry | null {
  const move = getPathMoveCommand(object);
  const curve = object.path.find((command) => command[0] === 'Q');
  if (
    !move ||
    !curve ||
    typeof move[1] !== 'number' ||
    typeof move[2] !== 'number' ||
    typeof curve[1] !== 'number' ||
    typeof curve[2] !== 'number' ||
    typeof curve[3] !== 'number' ||
    typeof curve[4] !== 'number'
  ) {
    return null;
  }

  return {
    start: projectPathPointToScene(object, move[1], move[2]),
    control: projectPathPointToScene(object, curve[1], curve[2]),
    end: projectPathPointToScene(object, curve[3], curve[4]),
  };
}

export function extractLegacyArrowGeometry(
  primitive: FabricObject,
  mode: string
): LegacyArrowGeometry | null {
  return primitive instanceof Path && mode === 'curve'
    ? extractCurveArrowGeometry(primitive as ArrowPathInstance)
    : extractStraightArrowGeometry(primitive);
}

export function isLegacyArrowPrimitive(object: unknown): object is FabricObject {
  return object instanceof Path || object instanceof Line;
}
