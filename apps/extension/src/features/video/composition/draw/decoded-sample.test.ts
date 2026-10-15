import { expect, it, vi } from 'vitest';
import { VideoSample } from 'mediabunny';
import { prepareDecodedVideoSample } from './decoded-sample';

function createSample() {
  return new VideoSample(new Uint8Array(24), {
    format: 'I420',
    codedWidth: 4,
    codedHeight: 4,
    timestamp: 2,
    duration: 1 / 30,
  });
}

it('transfers an already drawable sample without a copy or early release', async () => {
  const sample = createSample();
  const close = vi.spyOn(sample, 'close');
  expect(await prepareDecodedVideoSample(sample, new AbortController().signal)).toBe(sample);
  expect(close).not.toHaveBeenCalled();
  expect(sample.timestamp).toBe(2);
  sample.close();
});

it('releases an acquired sample when its owner was cancelled', async () => {
  const sample = createSample();
  const close = vi.spyOn(sample, 'close');
  const controller = new AbortController();
  controller.abort();
  await expect(prepareDecodedVideoSample(sample, controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(close).toHaveBeenCalledOnce();
});
