import { readFreehandSamplePoints, type FreehandStrokeSample } from './samples';
import { buildDynamicFreehandPathData } from './dynamic-width';

export function renderDynamicWidthFreehandPreview(args: {
  color: string;
  context: CanvasRenderingContext2D;
  samples: ReadonlyArray<FreehandStrokeSample>;
  saveAndTransform: (context: CanvasRenderingContext2D) => void;
  smoothingLevel: number;
  width: number;
}): boolean {
  const pathData = buildDynamicFreehandPathData(
    readFreehandSamplePoints(args.samples),
    {
      color: args.color,
      dynamicWidth: true,
      opacity: 1,
      shadow: 0,
      shapeCorrection: 'off',
      smoothingLevel: args.smoothingLevel,
      width: args.width,
    },
    args.samples
  );
  if (!pathData) {
    return false;
  }

  args.saveAndTransform(args.context);
  args.context.beginPath();
  pathData.forEach((command) => {
    if (command[0] === 'M') {
      args.context.moveTo(Number(command[1]), Number(command[2]));
    } else if (command[0] === 'L') {
      args.context.lineTo(Number(command[1]), Number(command[2]));
    } else if (command[0] === 'Q') {
      args.context.quadraticCurveTo(
        Number(command[1]),
        Number(command[2]),
        Number(command[3]),
        Number(command[4])
      );
    } else if (command[0] === 'Z') {
      args.context.closePath();
    }
  });
  args.context.fillStyle = args.color;
  args.context.fill();
  args.context.restore();
  return true;
}
