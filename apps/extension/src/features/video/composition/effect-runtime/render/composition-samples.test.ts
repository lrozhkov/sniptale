import { expect, it, vi } from 'vitest';
import { prepareEffectRuntimeCompositionSamples } from './composition-samples';
it('retires only the previously sampled pose and keeps overlay until disposal', async () => {
  const release = vi.fn(),
    render = vi.fn(async (time: number) => ({ time }));
  const scene = await prepareEffectRuntimeCompositionSamples({
    overlayTime: 1,
    sampleTimes: [1, 2, 3],
    stream: true,
    render,
    release,
  });
  await scene.prepareVisualPass!(2);
  const sampled = scene.framesByTime.get(2);
  await scene.prepareVisualPass!(2);
  expect(render).toHaveBeenCalledTimes(2);
  await scene.prepareVisualPass!(3);
  expect(release).toHaveBeenCalledWith(sampled);
  expect(scene.framesByTime.has(2)).toBe(false);
  await scene.prepareVisualPass!(1);
  expect(scene.framesByTime.size).toBe(1);
  scene.dispose!();
  scene.dispose!();
  expect(release).toHaveBeenCalledTimes(3);
});
it('releases late output when disposed while preparing a sample', async () => {
  let resolve!: (value: { time: number }) => void;
  const pending = new Promise<{ time: number }>((r) => {
      resolve = r;
    }),
    release = vi.fn();
  const scene = await prepareEffectRuntimeCompositionSamples({
    overlayTime: 1,
    sampleTimes: [2],
    stream: true,
    render: async (time) => (time === 1 ? { time } : pending),
    release,
  });
  const operation = scene.prepareVisualPass!(2);
  scene.dispose!();
  resolve({ time: 2 });
  await expect(operation).rejects.toThrow('DISPOSED');
  expect(release).toHaveBeenCalledTimes(2);
  expect(scene.framesByTime.size).toBe(0);
});
