import {
  resolveDrawingTextFontFamily,
  type DrawingTextMeasurementPort,
} from '../../features/drawing/public';

export const measureContentDrawingText: DrawingTextMeasurementPort = (args) => {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return args.line.length * args.fontSize * 0.55;
  context.font = `${args.fontSize}px ${resolveDrawingTextFontFamily(args.fontFamily)}`;
  return context.measureText(args.line).width;
};
