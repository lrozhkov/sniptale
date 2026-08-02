type ContainedFrameSize = Readonly<{
  height: number;
  width: number;
}>;

type ContainedFrame = ContainedFrameSize &
  Readonly<{
    x: number;
    y: number;
  }>;

export function resolveContainedFrame(
  source: ContainedFrameSize,
  output: ContainedFrameSize
): ContainedFrame {
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
