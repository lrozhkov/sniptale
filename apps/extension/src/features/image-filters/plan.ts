import {
  hasSourceImageFilters,
  parseSourceImageFilterStack,
  SourceImageFilterError,
  type SourceImageFilterSize,
} from './contract';
export type SourceFilterTexture = -1 | 0 | 1 | 2;
export interface SourceFilterStep {
  kind:
    | 'color'
    | 'kawase'
    | 'threshold'
    | 'bloom'
    | 'mix'
    | 'monochrome'
    | 'sepia'
    | 'sharpen'
    | 'pixelate'
    | 'vignette'
    | 'grain';
  input: SourceFilterTexture;
  base: SourceFilterTexture;
  output: 0 | 1 | 2;
  values: readonly number[];
}
export interface SourceImageFilterProgram {
  logical: Readonly<SourceImageFilterSize>;
  steps: readonly SourceFilterStep[];
  result: SourceFilterTexture;
  scratchCount: number;
}
/** One persisted grain implementation uses a deterministic 30 Hz project clock. */
export function sourceImageFilterTick(projectTime: number): number {
  if (!Number.isFinite(projectTime) || Math.abs(projectTime * 30) > Number.MAX_SAFE_INTEGER)
    throw new SourceImageFilterError();
  return Math.floor(projectTime * 30) >>> 0;
}
/** Three scratch targets suffice: retain the current filter input and ping-pong the other two. */
export function compileSourceImageFilters(
  value: unknown,
  logical: SourceImageFilterSize,
  projectTime = 0
): SourceImageFilterProgram {
  const stack = parseSourceImageFilterStack(value);
  const tick = sourceImageFilterTick(projectTime);
  if (
    !stack ||
    ![logical.width, logical.height].every(
      (n) => Number.isFinite(n) && n > 0 && n <= Number.MAX_SAFE_INTEGER
    )
  )
    throw new SourceImageFilterError();
  const steps: SourceFilterStep[] = [];
  let result: SourceFilterTexture = -1,
    scratchCount = 0;
  const emit = (
    kind: SourceFilterStep['kind'],
    input: SourceFilterTexture,
    base: SourceFilterTexture,
    values: number[]
  ) => {
    const output = ([0, 1, 2] as const).find((index) => index !== input && index !== base);
    if (output === undefined) throw new SourceImageFilterError();
    steps.push(Object.freeze({ kind, input, base, output, values: Object.freeze(values) }));
    scratchCount = Math.max(scratchCount, output + 1);
    return output;
  };
  for (const entry of stack.filters) {
    if (!hasSourceImageFilters({ version: 1, filters: [entry] })) continue;
    const base: SourceFilterTexture = result;
    if (entry.kind === 'color') {
      const p = entry.parameters;
      result = emit('color', base, base, [
        p.brightness * 2 ** p.exposure,
        p.contrast,
        p.saturation,
        entry.intensity,
        2 ** p.temperature,
        2 ** p.tint,
        2 ** -p.temperature,
      ]);
      continue;
    }
    if (entry.kind === 'monochrome' || entry.kind === 'sepia') {
      result = emit(entry.kind, base, base, [entry.intensity]);
      continue;
    }
    if (entry.kind === 'sharpen') {
      result = emit('sharpen', base, base, [entry.parameters.strength, entry.intensity]);
      continue;
    }
    if (entry.kind === 'pixelate') {
      result = emit('pixelate', base, base, [entry.parameters.size, entry.intensity]);
      continue;
    }
    if (entry.kind === 'vignette') {
      result = emit('vignette', base, base, [
        entry.parameters.amount,
        entry.parameters.radius,
        entry.parameters.softness,
        entry.intensity,
      ]);
      continue;
    }
    if (entry.kind === 'grain') {
      const seed = entry.parameters.seed;
      result = emit('grain', base, base, [
        entry.parameters.amount,
        seed & 65535,
        seed >>> 16,
        tick & 65535,
        tick >>> 16,
        entry.intensity,
      ]);
      continue;
    }
    if (entry.kind === 'bloom')
      result = emit('threshold', base, base, [entry.parameters.threshold]);
    if (entry.parameters.radius > 0)
      for (let pass = 0; pass < 4; pass++)
        result = emit('kawase', result, base, [entry.parameters.radius * (1 - pass / 4) + 0.5]);
    result =
      entry.kind === 'bloom'
        ? emit('bloom', result, base, [entry.parameters.gain, entry.intensity])
        : entry.intensity === 1
          ? result
          : emit('mix', result, base, [entry.intensity]);
  }
  return Object.freeze({
    logical: Object.freeze({ ...logical }),
    steps: Object.freeze(steps),
    result,
    scratchCount,
  });
}
