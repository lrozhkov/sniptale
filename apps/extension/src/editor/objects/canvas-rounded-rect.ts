type RoundedRectOptions = {
  height: number;
  left: number;
  radius: number;
  top: number;
  width: number;
};

export function traceCanvasRoundedRect(
  ctx: CanvasRenderingContext2D,
  options: RoundedRectOptions
): void {
  const radius = Math.min(Math.max(0, options.radius), options.width / 2, options.height / 2);
  const right = options.left + options.width;
  const bottom = options.top + options.height;

  ctx.beginPath();
  ctx.moveTo(options.left + radius, options.top);
  ctx.lineTo(right - radius, options.top);
  ctx.quadraticCurveTo(right, options.top, right, options.top + radius);
  ctx.lineTo(right, bottom - radius);
  ctx.quadraticCurveTo(right, bottom, right - radius, bottom);
  ctx.lineTo(options.left + radius, bottom);
  ctx.quadraticCurveTo(options.left, bottom, options.left, bottom - radius);
  ctx.lineTo(options.left, options.top + radius);
  ctx.quadraticCurveTo(options.left, options.top, options.left + radius, options.top);
  ctx.closePath();
}
