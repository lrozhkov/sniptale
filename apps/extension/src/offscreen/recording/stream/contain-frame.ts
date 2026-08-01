import type { OutputSize } from './crop-frame-gate';

export function isOnePixelEncoderCrop(source: OutputSize, output: OutputSize): boolean {
  return (
    source.width >= output.width &&
    source.width - output.width <= 1 &&
    source.height >= output.height &&
    source.height - output.height <= 1
  );
}

export function resolveContainedFrame(source: OutputSize, output: OutputSize) {
  const sourceAspect = source.width / source.height;
  const outputAspect = output.width / output.height;
  const width = sourceAspect > outputAspect ? output.width : output.height * sourceAspect;
  const height = sourceAspect > outputAspect ? output.width / sourceAspect : output.height;
  return {
    height,
    width,
    x: (output.width - width) / 2,
    y: (output.height - height) / 2,
  };
}

export function resolveCoverSourceRect(source: OutputSize, output: OutputSize) {
  const sourceAspect = source.width / source.height;
  const outputAspect = output.width / output.height;
  const width = sourceAspect > outputAspect ? source.height * outputAspect : source.width;
  const height = sourceAspect > outputAspect ? source.height : source.width / outputAspect;
  return {
    height,
    width,
    x: (source.width - width) / 2,
    y: (source.height - height) / 2,
  };
}
