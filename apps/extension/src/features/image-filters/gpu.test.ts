// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { graphics } from '../video/composition/canvas/gpu-preview.test-support';
import { createSourceImageFilterGpu } from './gpu';
import { createSourceImageFilter } from './contract';
import { compileSourceImageFilters } from './plan';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function fixture() {
  const mock = graphics();
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('Expected adapter.');
  const device = await adapter.requestDevice();
  const owner = await createSourceImageFilterGpu(device, mock.reserve);
  const source = device.createTexture({ size: [64, 48], format: 'rgba8unorm', usage: 4 });
  const program = compileSourceImageFilters(
    { version: 1, filters: [createSourceImageFilter('bloom', 'a')] },
    { width: 64, height: 48 }
  );
  return { mock, device, owner, source, program };
}
it('retains scratch and unique uniforms across completed frames without owning device or input', async () => {
  const { mock, device, owner, source, program } = await fixture();
  owner.beginFrame();
  const result = owner.encode(device.createCommandEncoder(), source, 'video', program);
  expect(result).not.toBe(source);
  expect(mock.pass.draw).toHaveBeenCalledTimes(program.steps.length);
  expect(new Set(mock.queue.writeBuffer.mock.calls.map(([buffer]) => buffer)).size).toBe(
    program.steps.length
  );
  expect(owner.allocatedBytes).toBe(program.scratchCount * 64 * 48 * 8 + program.steps.length * 64);
  expect(() => owner.encode(device.createCommandEncoder(), source, 'video', program)).toThrow();
  const allocations = mock.device.createTexture.mock.calls.length;
  owner.endFrame();
  owner.beginFrame();
  expect(owner.encode(device.createCommandEncoder(), source, 'video', program)).toBe(result);
  expect(mock.device.createTexture).toHaveBeenCalledTimes(allocations);
  owner.dispose();
  expect(owner.allocatedBytes).toBeGreaterThan(0);
  owner.endFrame();
  expect(owner.allocatedBytes).toBe(0);
  expect(mock.device.destroy).not.toHaveBeenCalled();
  const borrowed = mock.device.createTexture.mock.results[0];
  if (borrowed?.type !== 'return') throw new Error('Expected source.');
  expect(borrowed.value.destroy).not.toHaveBeenCalled();
  for (const result of mock.reserve.mock.results)
    if (result.type === 'return') expect(result.value.release).toHaveBeenCalledTimes(1);
});
it('bypasses neutral stacks and releases unused paths after completion', async () => {
  const { device, owner, source, program } = await fixture();
  owner.beginFrame();
  expect(
    owner.encode(
      device.createCommandEncoder(),
      source,
      'neutral',
      compileSourceImageFilters({ version: 1, filters: [] }, { width: 64, height: 48 })
    )
  ).toBe(source);
  expect(owner.allocatedBytes).toBe(0);
  owner.encode(device.createCommandEncoder(), source, 'video', program);
  owner.endFrame();
  owner.beginFrame();
  owner.endFrame();
  expect(owner.allocatedBytes).toBe(0);
  owner.dispose();
});
it('releases partial allocation after refusal and permits a later retry', async () => {
  const { mock, device, owner, source, program } = await fixture();
  mock.device.createBuffer.mockImplementationOnce(() => {
    throw new Error('Allocation refused.');
  });
  owner.beginFrame();
  expect(() => owner.encode(device.createCommandEncoder(), source, 'video', program)).toThrow(
    'Allocation refused'
  );
  expect(owner.allocatedBytes).toBeGreaterThan(0);
  owner.endFrame();
  expect(owner.allocatedBytes).toBe(0);
  owner.beginFrame();
  owner.encode(device.createCommandEncoder(), source, 'video', program);
  owner.endFrame();
  owner.dispose();
  expect(owner.allocatedBytes).toBe(0);
});
