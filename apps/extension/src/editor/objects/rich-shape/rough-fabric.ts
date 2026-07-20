import { Path, type FabricObject } from 'fabric';
import type { PathInfo } from 'roughjs/bin/core';
import type { RichShapeRenderableStyle } from './style';
import type { RoughDrawable } from './rough-types';

function createRoughFabricPathObject(
  pathInfo: PathInfo,
  style: RichShapeRenderableStyle
): FabricObject {
  const options: Record<string, unknown> = {
    fill: pathInfo.fill && pathInfo.fill !== 'none' ? pathInfo.fill : 'transparent',
    objectCaching: false,
    stroke: pathInfo.stroke,
    strokeLineCap: style.strokeLineCap,
    strokeLineJoin: style.strokeLineJoin,
    strokeUniform: true,
    strokeWidth: pathInfo.strokeWidth,
  };
  if (style.shadow) {
    options['shadow'] = style.shadow;
  }
  if (style.strokeDashArray && pathInfo.stroke === style.stroke) {
    options['strokeDashArray'] = style.strokeDashArray;
  }
  return new Path(pathInfo.d, options);
}

export function drawableToFabricObjects(
  toPaths: (drawable: RoughDrawable) => PathInfo[],
  drawable: RoughDrawable,
  style: RichShapeRenderableStyle
): FabricObject[] {
  return toPaths(drawable).map((pathInfo) => createRoughFabricPathObject(pathInfo, style));
}
