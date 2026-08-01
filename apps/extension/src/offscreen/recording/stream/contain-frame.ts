import type { OutputSize } from './crop-frame-gate';

function roundToEven(value: number, maximum: number): number {
  const rounded = Math.round(value / 2) * 2;
  const evenMaximum = maximum - (maximum % 2);
  return Math.max(2, Math.min(rounded, evenMaximum));
}

export function isOnePixelEncoderCrop(source: OutputSize, output: OutputSize): boolean {
  return (
    source.width >= output.width &&
    source.width - output.width <= 1 &&
    source.height >= output.height &&
    source.height - output.height <= 1
  );
}

export function resolveContainedFrame(source: OutputSize, output: OutputSize) {
  const scale = Math.min(output.width / source.width, output.height / source.height);
  const width = roundToEven(source.width * scale, output.width);
  const height = roundToEven(source.height * scale, output.height);
  return {
    height,
    width,
    x: Math.floor((output.width - width) / 2),
    y: Math.floor((output.height - height) / 2),
  };
}
