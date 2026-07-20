type ObjectFactoryStrokeDashStyle =
  | 'dash'
  | 'dash-dot'
  | 'dashed'
  | 'dot'
  | 'dotted'
  | 'long-dash'
  | 'solid';

export function createObjectFactoryStrokeDashArray(
  style: ObjectFactoryStrokeDashStyle,
  strokeWidth: number,
  options: {
    dashDotGapMultiplier?: number;
    dashGapMultiplier?: number;
    dashLengthMultiplier?: number;
    longDashGapMultiplier?: number;
    longDashLengthMultiplier?: number;
  } = {}
): number[] | undefined {
  const dashLengthMultiplier = options.dashLengthMultiplier ?? 3;
  const dashGapMultiplier = options.dashGapMultiplier ?? 1.6;
  const dashDotGapMultiplier = options.dashDotGapMultiplier ?? dashGapMultiplier;
  const longDashLengthMultiplier = options.longDashLengthMultiplier ?? 5;
  const longDashGapMultiplier = options.longDashGapMultiplier ?? 1.8;

  switch (style) {
    case 'dash':
    case 'dashed':
      return [
        Math.max(10, strokeWidth * dashLengthMultiplier),
        Math.max(6, strokeWidth * dashGapMultiplier),
      ];
    case 'dot':
    case 'dotted':
      return [Math.max(1, strokeWidth), Math.max(6, strokeWidth * 1.9)];
    case 'dash-dot':
      return [
        Math.max(10, strokeWidth * dashLengthMultiplier),
        Math.max(6, strokeWidth * dashDotGapMultiplier),
        Math.max(1, strokeWidth),
        Math.max(6, strokeWidth * dashDotGapMultiplier),
      ];
    case 'long-dash':
      return [
        Math.max(16, strokeWidth * longDashLengthMultiplier),
        Math.max(6, strokeWidth * longDashGapMultiplier),
      ];
    case 'solid':
    default:
      return undefined;
  }
}
