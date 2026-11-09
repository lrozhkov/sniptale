/** One owner schedules overlay and sampled poses for both concrete render representations. */
export async function prepareEffectRuntimeCompositionSamples<T>(args: {
  overlayTime: number;
  sampleTimes: readonly number[];
  stream: boolean;
  render(time: number, sampled: boolean): Promise<T>;
  release(value: T): void;
}) {
  const framesByTime = new Map<number, T>();
  let disposed = false,
    preparing = false;
  let sampledTime: number | undefined;
  const releaseSampled = () => {
    if (sampledTime === undefined) return;
    const sample = framesByTime.get(sampledTime);
    if (sample !== undefined) args.release(sample);
    framesByTime.delete(sampledTime);
    sampledTime = undefined;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const frames of new Set(framesByTime.values())) args.release(frames);
    framesByTime.clear();
  };
  const render = async (time: number, sampled: boolean) => {
    const value = await args.render(time, sampled);
    if (disposed) {
      args.release(value);
      throw new Error('EFFECT_RUNTIME_COMPOSITION_DISPOSED');
    }
    return value;
  };
  const prepareVisualPass = async (time: number) => {
    if (disposed) throw new Error('EFFECT_RUNTIME_COMPOSITION_DISPOSED');
    if (preparing) throw new Error('EFFECT_RUNTIME_COMPOSITION_BUSY');
    if (time === args.overlayTime) {
      releaseSampled();
      return;
    }
    if (time === sampledTime) return;
    if (!args.sampleTimes.includes(time)) throw new Error('EFFECT_RUNTIME_VISUAL_PASS_MISSING');
    releaseSampled();
    preparing = true;
    try {
      framesByTime.set(time, await render(time, true));
      sampledTime = time;
    } catch (error) {
      dispose();
      throw error;
    } finally {
      preparing = false;
    }
  };
  try {
    const overlayFrames = await render(args.overlayTime, false);
    framesByTime.set(args.overlayTime, overlayFrames);
    if (args.stream) return { framesByTime, overlayFrames, prepareVisualPass, dispose };
    for (const time of args.sampleTimes) {
      if (!framesByTime.has(time)) framesByTime.set(time, await render(time, true));
    }
    return { framesByTime, overlayFrames };
  } catch (error) {
    dispose();
    throw error;
  }
}
