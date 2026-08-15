type ContainedFrameSize = Readonly<{
  height: number;
  width: number;
}>;

type ContainedFrame = ContainedFrameSize &
  Readonly<{
    x: number;
    y: number;
  }>;

type SourceFrame = ContainedFrameSize &
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

export function resolveAspectMatchedSourceFrame(
  source: SourceFrame,
  output: ContainedFrameSize
): SourceFrame {
  const sourceAspect = source.width / source.height;
  const outputAspect = output.width / output.height;
  if (sourceAspect === outputAspect) return source;
  if (sourceAspect > outputAspect) {
    const width = source.height * outputAspect;
    return {
      ...source,
      width,
      x: source.x + (source.width - width) / 2,
    };
  }
  const height = source.width / outputAspect;
  return {
    ...source,
    height,
    y: source.y + (source.height - height) / 2,
  };
}
