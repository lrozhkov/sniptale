import { compileSourceImageFilters, type SourceFilterStep, type SourceFilterTexture } from './plan';
import { SourceImageFilterError, type SourceImageFilterSize } from './contract';
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
/** Independent straight-RGBA adapter for static images and conformance, with no browser or timeline clock. */
export function applySourceImageFilters(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  stack: unknown,
  logical: SourceImageFilterSize = { width, height },
  projectTime = 0
): Uint8ClampedArray {
  const program = compileSourceImageFilters(stack, logical, projectTime),
    count = width * height * 4;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    data.length !== count ||
    count * 4 * (program.scratchCount + 1) + count > 640 * 1024 * 1024
  )
    throw new SourceImageFilterError();
  if (!program.steps.length) return data.slice();
  const source = new Float32Array(count),
    scratch = Array.from({ length: program.scratchCount }, () => new Float32Array(count));
  for (let i = 0; i < count; i += 4) {
    const alpha = data[i + 3]! / 255;
    source[i] = (data[i]! / 255) * alpha;
    source[i + 1] = (data[i + 1]! / 255) * alpha;
    source[i + 2] = (data[i + 2]! / 255) * alpha;
    source[i + 3] = alpha;
  }
  const texture = (id: SourceFilterTexture) => (id === -1 ? source : scratch[id]!);
  const tap = (pixels: Float32Array, x: number, y: number, channel: number) => {
    const px = clamp(x, 0, width - 1),
      py = clamp(y, 0, height - 1),
      x0 = Math.floor(px),
      y0 = Math.floor(py),
      x1 = Math.min(x0 + 1, width - 1),
      y1 = Math.min(y0 + 1, height - 1),
      fx = px - x0,
      fy = py - y0;
    return (
      (pixels[(y0 * width + x0) * 4 + channel]! * (1 - fx) +
        pixels[(y0 * width + x1) * 4 + channel]! * fx) *
        (1 - fy) +
      (pixels[(y1 * width + x0) * 4 + channel]! * (1 - fx) +
        pixels[(y1 * width + x1) * 4 + channel]! * fx) *
        fy
    );
  };
  const process = (step: SourceFilterStep) => {
    const input = texture(step.input),
      base = texture(step.base),
      output = scratch[step.output]!,
      p = step.values;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        if (step.kind === 'kawase') {
          const dx = (p[0]! * width) / logical.width,
            dy = (p[0]! * height) / logical.height;
          for (let c = 0; c < 4; c++)
            output[offset + c] =
              (tap(input, x - dx, y - dy, c) +
                tap(input, x + dx, y - dy, c) +
                tap(input, x - dx, y + dy, c) +
                tap(input, x + dx, y + dy, c)) /
              4;
        } else if (step.kind === 'monochrome' || step.kind === 'sepia') {
          const r = input[offset]!,
            g = input[offset + 1]!,
            b = input[offset + 2]!,
            alpha = input[offset + 3]!;
          const gray = r * 0.2126 + g * 0.7152 + b * 0.0722;
          const values =
            step.kind === 'monochrome'
              ? [gray, gray, gray]
              : [
                  r * 0.393 + g * 0.769 + b * 0.189,
                  r * 0.349 + g * 0.686 + b * 0.168,
                  r * 0.272 + g * 0.534 + b * 0.131,
                ];
          for (let c = 0; c < 3; c++)
            output[offset + c] =
              input[offset + c]! * (1 - p[0]!) + clamp(values[c]!, 0, alpha) * p[0]!;
          output[offset + 3] = alpha;
        } else if (step.kind === 'sharpen') {
          const dx = width / logical.width,
            dy = height / logical.height,
            alpha = input[offset + 3]!;
          for (let c = 0; c < 3; c++) {
            const value =
              input[offset + c]! * (1 + 4 * p[0]!) -
              p[0]! *
                (tap(input, x - dx, y, c) +
                  tap(input, x + dx, y, c) +
                  tap(input, x, y - dy, c) +
                  tap(input, x, y + dy, c));
            output[offset + c] = input[offset + c]! * (1 - p[1]!) + clamp(value, 0, alpha) * p[1]!;
          }
          output[offset + 3] = alpha;
        } else if (step.kind === 'pixelate') {
          const px =
            ((Math.floor(((x + 0.5) * logical.width) / width / p[0]!) + 0.5) * p[0]! * width) /
              logical.width -
            0.5;
          const py =
            ((Math.floor(((y + 0.5) * logical.height) / height / p[0]!) + 0.5) * p[0]! * height) /
              logical.height -
            0.5;
          for (let c = 0; c < 4; c++)
            output[offset + c] = input[offset + c]! * (1 - p[1]!) + tap(input, px, py, c) * p[1]!;
        } else if (step.kind === 'vignette') {
          const minimum = Math.min(logical.width, logical.height);
          const distance =
            (Math.hypot(
              ((x + 0.5) / width - 0.5) * logical.width,
              ((y + 0.5) / height - 0.5) * logical.height
            ) *
              2) /
            minimum;
          const edge = clamp((distance - p[1]!) / Math.max(p[2]!, 0.000001));
          const factor = 1 - p[0]! * edge * edge * (3 - 2 * edge) * p[3]!;
          for (let c = 0; c < 3; c++) output[offset + c] = input[offset + c]! * factor;
          output[offset + 3] = input[offset + 3]!;
        } else if (step.kind === 'grain') {
          const seed = (p[1]! | (p[2]! << 16)) >>> 0,
            tick = (p[3]! | (p[4]! << 16)) >>> 0;
          let hash =
            (Math.floor(((x + 0.5) * logical.width) / width) ^
              Math.imul(Math.floor(((y + 0.5) * logical.height) / height), 0x9e3779b9) ^
              seed ^
              Math.imul(tick, 0x85ebca6b)) >>>
            0;
          hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d) >>> 0;
          hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b) >>> 0;
          hash = (hash ^ (hash >>> 16)) >>> 0;
          const noise = ((hash & 65535) / 65535 - 0.5) * p[0]!,
            alpha = input[offset + 3]!;
          for (let c = 0; c < 3; c++) {
            const value = alpha ? input[offset + c]! / alpha : 0;
            output[offset + c] =
              input[offset + c]! * (1 - p[5]!) + clamp(value + noise) * alpha * p[5]!;
          }
          output[offset + 3] = alpha;
        } else if (step.kind === 'threshold') {
          const brightness =
            (Math.max(input[offset]!, input[offset + 1]!, input[offset + 2]!) +
              Math.min(input[offset]!, input[offset + 1]!, input[offset + 2]!)) /
            2;
          for (let c = 0; c < 4; c++)
            output[offset + c] = brightness > p[0]! ? input[offset + c]! : 0;
        } else if (step.kind === 'color') {
          const alpha = input[offset + 3]!,
            r = alpha ? input[offset]! / alpha : 0,
            g = alpha ? input[offset + 1]! / alpha : 0,
            b = alpha ? input[offset + 2]! / alpha : 0,
            luma = r * 0.2125 + g * 0.7154 + b * 0.0721;
          for (let c = 0; c < 3; c++) {
            const current = c === 0 ? r : c === 1 ? g : b;
            const next =
              clamp((0.5 + (luma + (current - luma) * p[2]! - 0.5) * p[1]!) * p[4 + c]! * p[0]!) *
              alpha;
            output[offset + c] = input[offset + c]! * (1 - p[3]!) + next * p[3]!;
          }
          output[offset + 3] = alpha;
        } else if (step.kind === 'mix')
          for (let c = 0; c < 4; c++)
            output[offset + c] = base[offset + c]! * (1 - p[0]!) + input[offset + c]! * p[0]!;
        else {
          const color = [0, 1, 2].map((c) => clamp(base[offset + c]! + input[offset + c]! * p[0]!));
          const alpha = Math.max(base[offset + 3]!, ...color);
          for (let c = 0; c < 3; c++)
            output[offset + c] = base[offset + c]! * (1 - p[1]!) + color[c]! * p[1]!;
          output[offset + 3] = base[offset + 3]! * (1 - p[1]!) + alpha * p[1]!;
        }
      }
  };
  for (const step of program.steps) process(step);
  const result = texture(program.result),
    out = new Uint8ClampedArray(count);
  for (let i = 0; i < count; i += 4) {
    const alpha = result[i + 3]!;
    out[i + 3] = Math.round(clamp(alpha) * 255);
    for (let c = 0; c < 3; c++)
      out[i + c] = alpha ? Math.round(clamp(result[i + c]! / alpha) * 255) : 0;
  }
  return out;
}
