import { afterEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { createVideoProjectSceneEdges } from '../../../features/video/project/scene/edge-fades';
import { applyOfflineSceneEdgeGain } from './scene-edges';

afterEach(() => vi.useRealTimers());
function fixture(length = 16, rate = 4) {
  const project = createEmptyVideoProject('Final mix');
  project.duration = 4;
  project.sceneEdges = createVideoProjectSceneEdges();
  project.sceneEdges.intro = { enabled: true, duration: 2, audioFade: true };
  project.sceneEdges.outro = { enabled: true, duration: 2, audioFade: true };
  const channels = [new Float32Array(length).fill(0.8), new Float32Array(length).fill(-0.4)];
  const output = {
    length,
    sampleRate: rate,
    numberOfChannels: 2,
    getChannelData: (channel: number) => channels[channel]!,
  } as AudioBuffer;
  return { project, output, channels };
}

it('scales the complete stereo mix once at absolute project sample times', async () => {
  const { project, output, channels } = fixture();
  await applyOfflineSceneEdgeGain(output, project, 0);
  for (let frame = 0; frame < output.length; frame++) {
    const time = frame / output.sampleRate;
    // Sixteen samples at 4 Hz end at 3.75 s. Both 2 s fades fit to 1.875 s.
    const gain = time <= 1.875 ? time / 1.875 : (3.75 - time) / 1.875;
    expect(Math.abs(channels[0]![frame]! - 0.8 * gain)).toBeLessThan(1e-6);
    expect(Math.abs(channels[1]![frame]! + 0.4 * gain)).toBeLessThan(1e-6);
  }
  const fragment = fixture(8);
  await applyOfflineSceneEdgeGain(fragment.output, fragment.project, 1);
  expect(Array.from(fragment.channels[0]!)).toEqual(Array.from(channels[0]!.slice(4, 12)));
});

it('keeps disabled audio neutral while visual overlap still constrains the active audio edge', async () => {
  const { project, output, channels } = fixture();
  project.sceneEdges!.intro.duration = 4;
  project.sceneEdges!.outro.duration = 4;
  project.sceneEdges!.outro.audioFade = false;
  await applyOfflineSceneEdgeGain(output, project, 0);
  expect(channels[0]![4]).toBeCloseTo(0.8 / 1.875, 6);
  expect(channels[0]![15]).toBeCloseTo(0.8, 6);
  const neutral = fixture();
  neutral.project.sceneEdges!.intro.audioFade = false;
  neutral.project.sceneEdges!.outro.audioFade = false;
  const read = vi.spyOn(neutral.output, 'getChannelData');
  await applyOfflineSceneEdgeGain(neutral.output, neutral.project, 0);
  expect(read).not.toHaveBeenCalled();
});

it('refuses aborted work and yields between bounded blocks without publishing a result', async () => {
  vi.useFakeTimers();
  const { project, output, channels } = fixture(128);
  const controller = new AbortController();
  const pending = applyOfflineSceneEdgeGain(output, project, 0, controller.signal);
  const rejection = expect(pending).rejects.toThrow();
  expect(channels[0]![0]).toBe(0);
  expect(channels[0]![32]).toBeCloseTo(0.8, 6);
  controller.abort();
  await vi.runAllTimersAsync();
  await rejection;
  const refused = fixture();
  await expect(
    applyOfflineSceneEdgeGain(refused.output, refused.project, 0, controller.signal)
  ).rejects.toThrow();
  expect(refused.channels[0]![0]).toBeCloseTo(0.8, 6);
});
