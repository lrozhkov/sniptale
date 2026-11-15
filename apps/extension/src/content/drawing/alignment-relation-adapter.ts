import {
  collectDrawingDimensionCandidates,
  getDrawingObjectBounds,
  getDrawingObjectSkewX,
  transformDrawingObjectPoint,
  transformDrawingObjectVector,
  type DrawingDimensionCandidate,
  type DrawingDimensionGeometry,
  type DrawingObject,
} from '../../features/drawing/public';

/** Logical box dimensions use actual local edges, including the object's rotation. */
export function measureDrawingRelationDimensions(object: DrawingObject): DrawingDimensionGeometry {
  if (
    object.kind === 'arrow' ||
    object.kind === 'pencil' ||
    object.kind === 'marker' ||
    object.kind === 'text' ||
    getDrawingObjectSkewX(object) !== 0
  )
    return { id: object.id };
  const bounds = getDrawingObjectBounds(object);
  const from = transformDrawingObjectPoint(object, bounds);
  return {
    id: object.id,
    width: {
      value: bounds.width,
      from,
      to: transformDrawingObjectPoint(object, { x: bounds.x + bounds.width, y: bounds.y }),
    },
    height: {
      value: bounds.height,
      from,
      to: transformDrawingObjectPoint(object, { x: bounds.x, y: bounds.y + bounds.height }),
    },
  };
}

type DimensionProposalInput = {
  original: DrawingObject;
  object: DrawingObject;
  geometry: { x: number; y: number };
  modifiers: { ctrlKey: boolean; shiftKey: boolean };
  objects: readonly DrawingObject[];
};

function logicalHandleDisplacement(
  axis: 'x' | 'y',
  candidate: DrawingDimensionCandidate,
  source: DrawingDimensionGeometry,
  args: DimensionProposalInput
): number {
  const dimension = axis === 'x' ? 'width' : 'height';
  const measurement = source[dimension];
  const reference = source[candidate.dimension];
  if (!measurement || !reference || !args.geometry[axis]) return 0;
  if (candidate.dimension !== dimension && !args.modifiers.shiftKey) return 0;
  const difference = candidate.value - reference.value;
  const amount =
    candidate.dimension === dimension
      ? difference
      : (difference * measurement.value) / reference.value;
  return (args.geometry[axis] * amount) / (args.modifiers.ctrlKey ? 2 : 1);
}

/** Converts size proposals to native handle displacement; selection and admission stay in the caller. */
export function collectDrawingResizeDimensionChoices(args: DimensionProposalInput) {
  const source = measureDrawingRelationDimensions(args.object);
  const targets = args.objects
    .filter((object) => object.id !== args.original.id)
    .map(measureDrawingRelationDimensions);
  const candidates = collectDrawingDimensionCandidates({ source, targets });
  const dimensions = candidates.flatMap((candidate) => {
    const sign = candidate.dimension === 'width' ? args.geometry.x : args.geometry.y;
    if (!sign && !args.modifiers.shiftKey) return [];
    const local = {
      x: logicalHandleDisplacement('x', candidate, source, args),
      y: logicalHandleDisplacement('y', candidate, source, args),
    };
    return [{ candidate, local, correction: transformDrawingObjectVector(args.original, local) }];
  });
  return { source, targets, dimensions };
}
