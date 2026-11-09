import { expect, it, vi } from 'vitest';
import { createReviewPreviewPresentation } from './preview-presentation';

const flush = async () => {
  for (let index = 0; index < 6; index++) await Promise.resolve();
};

function sourceCaptureFixture() {
  const gate = Promise.withResolvers<{ value: string; release(): void }>();
  const ticks = new Map<number, () => void>();
  let sequence = 0;
  const prepared = { value: 'prepared', release: vi.fn() };
  const captured = { value: 'decoded', release: vi.fn() };
  const output = { value: 'pixels', release: vi.fn() };
  const capture = vi.fn((_prepared: string, _time: number, _signal: AbortSignal) => gate.promise);
  const render = vi.fn(
    (_prepared: string, _source: string, _request: unknown, _signal: AbortSignal) => output
  );
  const publish = vi.fn();
  const onError = vi.fn();
  const scheduler = createReviewPreviewPresentation({
    requestTick(callback) {
      ticks.set(++sequence, callback);
      return sequence;
    },
    cancelTick: (id) => ticks.delete(id),
    now: () => 0,
    sampleTime: () => 17.1,
    prepare: async () => prepared,
    capture,
    render,
    publish,
    onError,
  });
  const state = {
    scene: 'scene',
    generation: '1',
    visible: true,
    playing: false,
    interacting: false,
    frameRate: null,
    detailedPaused: false,
    pausedTime: 17.1,
  };
  const start = async () => {
    scheduler.update(state);
    const callbacks = [...ticks.values()];
    ticks.clear();
    callbacks.forEach((callback) => callback());
    await flush();
  };
  return { gate, prepared, captured, capture, render, publish, onError, scheduler, state, start };
}

it('waits for a decoded source before render and holds it through composition', async () => {
  const f = sourceCaptureFixture();
  await f.start();
  expect(f.capture).toHaveBeenCalledOnce();
  expect(f.capture.mock.calls[0]![1]).toBe(17.1);
  expect(f.render).not.toHaveBeenCalled();
  expect(f.prepared.release).not.toHaveBeenCalled();
  f.gate.resolve(f.captured);
  await flush();
  expect(f.render.mock.calls[0]?.[1]).toBe('decoded');
  expect(f.publish).toHaveBeenCalledOnce();
  expect(f.captured.release).toHaveBeenCalledOnce();
  expect(f.prepared.release).toHaveBeenCalledOnce();
  expect(f.onError).not.toHaveBeenCalled();
  f.scheduler.dispose();
});

it.each(['invalidate', 'dispose'] as const)(
  'releases a late decoded source without publishing after %s',
  async (operation) => {
    const f = sourceCaptureFixture();
    await f.start();
    if (operation === 'dispose') f.scheduler.dispose();
    else f.scheduler.update({ ...f.state, generation: '2' });
    expect(f.capture.mock.calls[0]![2].aborted).toBe(true);
    expect(f.prepared.release).not.toHaveBeenCalled();
    f.gate.resolve(f.captured);
    await flush();
    expect(f.render).not.toHaveBeenCalled();
    expect(f.publish).not.toHaveBeenCalled();
    expect(f.captured.release).toHaveBeenCalledOnce();
    expect(f.prepared.release).toHaveBeenCalledOnce();
    expect(f.onError).not.toHaveBeenCalled();
    f.scheduler.dispose();
  }
);

it('reports a real decoded-source failure and releases the prepared scene', async () => {
  const f = sourceCaptureFixture();
  await f.start();
  const failure = new Error('Preview source frame is unavailable.');
  f.gate.reject(failure);
  await flush();
  expect(f.onError).toHaveBeenCalledExactlyOnceWith(failure);
  expect(f.render).not.toHaveBeenCalled();
  expect(f.publish).not.toHaveBeenCalled();
  expect(f.prepared.release).toHaveBeenCalledOnce();
  f.scheduler.dispose();
});
