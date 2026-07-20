import { Gradient } from 'fabric';
import type { EditorRichShapeGradientFill } from '../../../features/editor/document/rich-shape';
import { hexToRgba } from '../../document/model';
import { clampRichShapeOpacity, richShapeTransparencyToOpacity } from './opacity';

function createGradientColorStops(fill: EditorRichShapeGradientFill, fillTransparency: number) {
  const fillOpacity = richShapeTransparencyToOpacity(fillTransparency);
  return fill.stops.map((stop) => ({
    offset: Math.max(0, Math.min(1, stop.offset)),
    color: hexToRgba(
      stop.color,
      clampRichShapeOpacity(richShapeTransparencyToOpacity(stop.transparency) * fillOpacity)
    ),
  }));
}

export function createLinearRichShapeFill(
  fill: EditorRichShapeGradientFill,
  width: number,
  height: number,
  fillTransparency = 0
) {
  const angle = ((fill.angle - 90) * Math.PI) / 180;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = (Math.abs(Math.cos(angle)) * width) / 2 + (Math.abs(Math.sin(angle)) * height) / 2;
  const deltaX = Math.cos(angle) * radius;
  const deltaY = Math.sin(angle) * radius;

  return new Gradient({
    type: 'linear',
    coords: {
      x1: centerX - deltaX,
      y1: centerY - deltaY,
      x2: centerX + deltaX,
      y2: centerY + deltaY,
    },
    colorStops: createGradientColorStops(fill, fillTransparency),
  });
}

export function createRadialRichShapeFill(
  fill: EditorRichShapeGradientFill,
  width: number,
  height: number,
  fillTransparency = 0
) {
  const radius = Math.max(width, height) / 2;

  return new Gradient({
    type: 'radial',
    coords: {
      x1: width / 2,
      y1: height / 2,
      r1: 0,
      x2: width / 2,
      y2: height / 2,
      r2: radius,
    },
    colorStops: createGradientColorStops(fill, fillTransparency),
  });
}
