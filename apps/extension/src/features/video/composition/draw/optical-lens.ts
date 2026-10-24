type Bounds = { x: number; y: number; width: number; height: number };

/** Keep the sharp source draw native; only the refracting glass rim uses a bounded raster. */
export function drawOpticalGlass(
  context: CanvasRenderingContext2D,
  bounds: Bounds,
  scale: number,
  corner: number | 'circle',
  sampleSource: (sample: CanvasRenderingContext2D) => void,
  drawSharp: () => void,
  edgeWidth = 8
): void {
  const side = Math.max(1, Math.min(256, Math.ceil(Math.max(bounds.width, bounds.height))));
  const input = document.createElement('canvas');
  const output = document.createElement('canvas');
  input.width = input.height = output.width = output.height = side;
  try {
    const sample = input.getContext('2d', { willReadFrequently: true });
    const result = output.getContext('2d');
    let glass = false;
    if (sample && result) {
      sample.scale(side / bounds.width, side / bounds.height);
      sampleSource(sample);
      try {
        const pixels = sample.getImageData(0, 0, side, side);
        const rim = result.createImageData(side, side);
        warpOpticalRim(pixels.data, rim.data, side, scale, corner, edgeWidth, bounds);
        result.putImageData(rim, 0, 0);
        glass = true;
      } catch {
        // Tainted or unavailable readback must not remove the readable magnification.
      }
    }
    drawSharp();
    if (glass) context.drawImage(output, bounds.x, bounds.y, bounds.width, bounds.height);
  } finally {
    input.width = input.height = output.width = output.height = 0;
  }
}

/** Inverse sampling leaves the authored central field untouched and bends only its glass shoulder. */
export function warpOpticalRim(
  input: Uint8ClampedArray,
  output: Uint8ClampedArray,
  side: number,
  scale: number,
  corner: number | 'circle',
  edgeWidth = 8,
  size = { width: 1, height: 1 }
): void {
  const radius = side / 2;
  const shoulderWidth = Math.max(0.01, Math.min(0.3, edgeWidth / 100));
  const halfWidth = size.width / Math.min(size.width, size.height);
  const halfHeight = size.height / Math.min(size.width, size.height);
  const rounded = typeof corner === 'number' ? Math.max(0, Math.min(1, corner)) : 0;
  for (let row = 0; row < side; row++) {
    for (let column = 0; column < side; column++) {
      const x = (column + 0.5 - radius) / radius;
      const y = (row + 0.5 - radius) / radius;
      const qx = Math.abs(x * halfWidth) - (halfWidth - rounded);
      const qy = Math.abs(y * halfHeight) - (halfHeight - rounded);
      const distance =
        corner === 'circle'
          ? Math.hypot(x, y)
          : 1 +
            Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
            Math.min(Math.max(qx, qy), 0) -
            rounded;
      if (distance <= 1 - shoulderWidth || distance >= 1) continue;
      const shoulder = (distance - (1 - shoulderWidth)) / shoulderWidth;
      const bend = shoulder * shoulder * (3 - 2 * shoulder);
      const localScale = scale + (1 - scale) * bend;
      const dispersion = Math.sin(Math.PI * shoulder) ** 2 * 0.012 * Math.min(1, scale - 1);
      const edge = Math.exp(-(((1 - shoulder) / 0.08) ** 2));
      const light = Math.max(0, (-x - y) / Math.max(0.001, Math.hypot(x, y) * Math.SQRT2));
      const highlight = edge * (0.12 + 0.38 * light);
      const shade = Math.exp(-(((shoulder - 0.88) / 0.14) ** 2)) * 0.12 * (1 - light);
      const fade = Math.min(1, shoulder / 0.2);
      const alpha = fade * fade * (3 - 2 * fade);
      const target = (row * side + column) * 4;
      for (let channel = 0; channel < 4; channel++) {
        const shift = channel < 3 ? (channel - 1) * dispersion : 0;
        const sx = radius + x * radius * (1 / localScale + shift) - 0.5;
        const sy = radius + y * radius * (1 / localScale + shift) - 0.5;
        const value = sampleChannel(input, side, sx, sy, channel);
        output[target + channel] =
          channel === 3 ? value * alpha : value * (1 - shade) + (255 - value) * highlight;
      }
    }
  }
}

function sampleChannel(
  pixels: Uint8ClampedArray,
  side: number,
  x: number,
  y: number,
  channel: number
) {
  const sx = Math.max(0, Math.min(side - 1, x));
  const sy = Math.max(0, Math.min(side - 1, y));
  const x0 = Math.floor(sx),
    y0 = Math.floor(sy);
  const x1 = Math.min(side - 1, x0 + 1),
    y1 = Math.min(side - 1, y0 + 1);
  const wx = sx - x0,
    wy = sy - y0;
  const upper =
    pixels[(y0 * side + x0) * 4 + channel]! * (1 - wx) +
    pixels[(y0 * side + x1) * 4 + channel]! * wx;
  const lower =
    pixels[(y1 * side + x0) * 4 + channel]! * (1 - wx) +
    pixels[(y1 * side + x1) * 4 + channel]! * wx;
  return upper * (1 - wy) + lower * wy;
}
