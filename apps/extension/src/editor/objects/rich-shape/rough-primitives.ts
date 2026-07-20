import type { FabricObject } from 'fabric';
import rough from 'roughjs';
import type { EditorRichShapeDocumentObject } from '../../../features/editor/document/rich-shape';
import { drawableToFabricObjects } from './rough-fabric';
import { createRoughOptions, resolveRoughFill } from './rough-options';
import type { RoughPoint } from './rough-types';
import type { RichShapeRenderableStyle } from './style/renderable';

const ROUGH_GENERATOR = rough.generator();

function renderRoughDrawable(
  drawable: ReturnType<typeof ROUGH_GENERATOR.path>,
  style: RichShapeRenderableStyle
): FabricObject[] {
  return drawableToFabricObjects(ROUGH_GENERATOR.toPaths.bind(ROUGH_GENERATOR), drawable, style);
}

export function createRoughPathObjects(options: {
  path: string;
  seedOffset: number;
  shape: EditorRichShapeDocumentObject;
  style: RichShapeRenderableStyle;
}): FabricObject[] {
  const roughOptions = createRoughOptions({
    fill: resolveRoughFill(options.shape),
    seedOffset: options.seedOffset,
    shape: options.shape,
    style: options.style,
  });
  return renderRoughDrawable(ROUGH_GENERATOR.path(options.path, roughOptions), options.style);
}

export function createRoughPolylineObjects(options: {
  closed: boolean;
  fillOverride?: string;
  points: RoughPoint[];
  seedOffset: number;
  shape: EditorRichShapeDocumentObject;
  style: RichShapeRenderableStyle;
}): FabricObject[] {
  const fill =
    options.fillOverride ?? (options.closed ? resolveRoughFill(options.shape) : undefined);
  const roughOptions = createRoughOptions({
    fill,
    seedOffset: options.seedOffset,
    shape: options.shape,
    style: options.style,
  });
  const [start, end] = options.points;
  const drawable =
    !options.closed && options.points.length === 2 && start && end
      ? ROUGH_GENERATOR.line(start[0], start[1], end[0], end[1], roughOptions)
      : options.closed
        ? ROUGH_GENERATOR.polygon(options.points, roughOptions)
        : ROUGH_GENERATOR.linearPath(options.points, roughOptions);

  return renderRoughDrawable(drawable, options.style);
}

export function createRoughEllipseObjects(options: {
  center: RoughPoint;
  radius: number;
  seedOffset: number;
  shape: EditorRichShapeDocumentObject;
  style: RichShapeRenderableStyle;
}): FabricObject[] {
  const roughOptions = createRoughOptions({
    fill: options.style.stroke,
    seedOffset: options.seedOffset,
    shape: options.shape,
    style: options.style,
  });
  return renderRoughDrawable(
    ROUGH_GENERATOR.ellipse(
      options.center[0],
      options.center[1],
      options.radius * 2,
      options.radius * 2,
      roughOptions
    ),
    options.style
  );
}
