import { describe, expect, it, vi } from 'vitest';
import {
  createRasterComputeClient,
  executeRasterCompute,
  parseRasterComputeCommand,
  RasterComputeError,
  type RasterWorker,
} from './compute';
import type { RasterPixelData } from './pixels';
const source: RasterPixelData = {
  width: 2,
  height: 1,
  color: new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255]),
  visibility: null,
  key: null,
};
function worker() {
  const events = new EventTarget();
  const value: RasterWorker = {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  };
  return {
    value,
    reply(data: unknown) {
      events.dispatchEvent(new MessageEvent('message', { data }));
    },
  };
}
describe('raster compute boundary', () => {
  it('refuses invalid dimensions and masks before allocation', () => {
    expect(() =>
      parseRasterComputeCommand({
        kind: 'region',
        pixels: { ...source, width: 100000 },
        selection: null,
      })
    ).toThrow();
    expect(() =>
      parseRasterComputeCommand({
        kind: 'region',
        pixels: source,
        selection: new Uint8Array([1, 255]),
      })
    ).toThrow();
    expect(() =>
      parseRasterComputeCommand({
        kind: 'decode',
        metadata: { sniptaleRasterOriginalData: 'https://private.invalid/image' },
      })
    ).toThrow();
  });
  it('finds source regions without mutating accepted planes', async () => {
    const before = source.color.slice();
    const result = await executeRasterCompute({
      kind: 'region',
      pixels: source,
      selection: new Uint8Array([255, 0]),
      seed: { x: 0, y: 0 },
      tolerance: 0,
      grow: 5,
      contiguous: true,
    });
    expect(result).toEqual({ kind: 'region', mask: new Uint8Array([255, 0]) });
    expect(source.color).toEqual(before);
  });
  it('constructs lazily, cancels a held job and ignores its late reply on retry', async () => {
    const first = worker(),
      second = worker(),
      factory = vi.fn().mockReturnValueOnce(first.value).mockReturnValueOnce(second.value);
    const client = createRasterComputeClient({ createWorker: factory });
    expect(factory).not.toHaveBeenCalled();
    const command = {
      kind: 'region',
      pixels: source,
      selection: null,
      seed: { x: 0, y: 0 },
      tolerance: 0,
      grow: 0,
      contiguous: true,
    } as const;
    const pending = client.run(command);
    const refusal = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    client.cancel();
    await refusal;
    const retry = client.run(command);
    first.reply({ id: 1, ok: true, value: { kind: 'region', mask: new Uint8Array([255, 255]) } });
    second.reply({ id: 2, ok: true, value: { kind: 'region', mask: new Uint8Array([255, 0]) } });
    await expect(retry).resolves.toEqual({ kind: 'region', mask: new Uint8Array([255, 0]) });
    expect(first.value.terminate).toHaveBeenCalledOnce();
    expect(source.color.byteLength).toBe(8);
    client.dispose();
  });
  it('maps worker failures to fixed safe codes and detaches no accepted buffers', async () => {
    const fake = worker(),
      client = createRasterComputeClient({ createWorker: () => fake.value });
    const result = client.run({
      kind: 'region',
      pixels: source,
      selection: null,
      seed: { x: 0, y: 0 },
      tolerance: 0,
      grow: 0,
      contiguous: true,
    });
    fake.reply({ id: 1, ok: false, code: 'private URL and stack' });
    await expect(result).rejects.toEqual(new RasterComputeError('compute-failed'));
    expect(fake.value.postMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    expect(source.color.byteLength).toBe(8);
    client.dispose();
  });
});

it('rejects a malformed worker result and removes a completed signal before reusing the worker', async () => {
  const fake = worker(),
    client = createRasterComputeClient({ createWorker: () => fake.value }),
    controller = new AbortController();
  const command = {
    kind: 'region',
    pixels: source,
    selection: null,
    seed: { x: 0, y: 0 },
    tolerance: 0,
    grow: 0,
    contiguous: true,
  } as const;
  const first = client.run(command, controller.signal);
  fake.reply({ id: 1, ok: true, value: { kind: 'region', mask: new Uint8Array([255, 255]) } });
  await first;
  const second = client.run(command);
  controller.abort();
  expect(fake.value.terminate).not.toHaveBeenCalled();
  fake.reply({ id: 2, ok: true, value: { kind: 'region', mask: new Uint8Array([255]) } });
  await expect(second).rejects.toMatchObject({ code: 'compute-failed' });
  client.dispose();
});

it('executes source fill, hide, remove-color and fragments with admitted metadata and unchanged inputs', async () => {
  const { encodePngRgba, decodePngRgba } = await import('../../platform/media-utils/png-codec');
  const { createEditorRasterMetadata, decodeEditorRasterPixels } = await import('./image-state');
  const png = await encodePngRgba({ ...source, rgba: source.color });
  const dataUrl = `data:image/png;base64,${Buffer.from(await png.arrayBuffer()).toString('base64')}`,
    metadata = createEditorRasterMetadata(dataUrl, 2, 1);
  for (const action of ['fill', 'hide', 'remove'] as const) {
    const result = await executeRasterCompute({
      kind: 'edit',
      metadata,
      pixels: source,
      region: new Uint8Array([255, 0]),
      selection: new Uint8Array([255, 0]),
      action,
      color: [255, 0, 0, 255],
    });
    expect(result.kind).toBe('encoded');
    if (result.kind === 'encoded') {
      const planes = await decodeEditorRasterPixels(result.candidate.metadata);
      if (action === 'hide') expect(planes.visibility).toEqual(new Uint8Array([0, 255]));
      if (action === 'remove') expect(planes.key?.[3]).toBe(255);
      if (action === 'fill') expect(planes.color).toEqual(source.color);
    }
  }
  const result = await executeRasterCompute({
    kind: 'fragment',
    pixels: source,
    selection: new Uint8Array([0, 255]),
    bounds: { x: 0, y: 0, width: 2, height: 1 },
  });
  expect(result.kind).toBe('fragment');
  if (result.kind === 'fragment') {
    const response = await fetch(result.dataUrl);
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    expect(await decodePngRgba({ bytes, width: 2, height: 1 })).toEqual(
      new Uint8ClampedArray([0, 0, 0, 0, 255, 0, 0, 255])
    );
  }
  expect(source.color).toEqual(new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255]));
  expect(source.visibility).toBe(null);
});
it('refuses malformed operation payloads before any source mutation', async () => {
  const { createEditorRasterMetadata } = await import('./image-state');
  const metadata = createEditorRasterMetadata('data:image/png;base64,QUJDRA==', 2, 1);
  const region = {
    kind: 'region',
    pixels: source,
    selection: null,
    seed: { x: 0, y: 0 },
    tolerance: 0,
    grow: 0,
    contiguous: true,
  };
  const edit = {
    kind: 'edit',
    metadata,
    pixels: source,
    selection: null,
    region: new Uint8Array([255, 0]),
    action: 'fill',
    color: [0, 0, 0, 255],
  };
  const malformed: unknown[] = [
    null,
    { ...region, pixels: null },
    { ...region, pixels: { ...source, visibility: [] } },
    { ...region, pixels: { ...source, key: new Uint8ClampedArray(1) } },
    { ...region, selection: [] },
    { ...region, seed: { x: -1, y: 0 } },
    { ...region, tolerance: 256 },
    { ...region, grow: -1 },
    { ...region, contiguous: 'yes' },
    { ...edit, color: [0, 0, 0, 256] },
    { ...edit, action: 'unknown' },
    { ...edit, region: null },
    {
      ...edit,
      metadata: { ...metadata, sniptaleRasterState: { ...metadata.sniptaleRasterState, width: 1 } },
    },
    {
      kind: 'encode',
      metadata,
      before: source,
      after: { width: 1, height: 1, color: new Uint8ClampedArray(4), visibility: null, key: null },
    },
    { kind: 'fragment', pixels: source, selection: null, bounds: null },
    {
      kind: 'fragment',
      pixels: source,
      selection: null,
      bounds: { x: 1, y: 0, width: 2, height: 1 },
    },
    { ...region, kind: 'unknown' },
  ];
  for (const command of malformed)
    expect(() => parseRasterComputeCommand(command)).toThrowError(
      new RasterComputeError('invalid-command')
    );
  expect(source.color.byteLength).toBe(8);
});
it('owns transport error, aborted acquisition, supersession and retry lifetimes', async () => {
  const first = worker(),
    second = worker(),
    factory = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('constructor');
      })
      .mockReturnValueOnce(first.value)
      .mockReturnValue(second.value);
  const client = createRasterComputeClient({ createWorker: factory });
  const command = {
    kind: 'region',
    pixels: source,
    selection: null,
    seed: { x: 0, y: 0 },
    tolerance: 0,
    grow: 0,
    contiguous: true,
  } as const;
  await expect(client.run(command)).rejects.toMatchObject({ code: 'compute-failed' });
  vi.mocked(first.value.postMessage).mockImplementationOnce(() => {
    throw new Error('post');
  });
  await expect(client.run(command)).rejects.toMatchObject({ code: 'compute-failed' });
  expect(first.value.terminate).toHaveBeenCalledOnce();
  const aborted = new AbortController();
  aborted.abort();
  await expect(client.run(command, aborted.signal)).rejects.toMatchObject({ code: 'cancelled' });
  const pending = client.run(command),
    cancelled = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  const retry = client.run(command);
  await cancelled;
  second.reply(null);
  second.reply({ id: 2, ok: true, value: { kind: 'region', mask: new Uint8Array([255, 0]) } });
  second.reply({ id: 3, ok: true, value: { kind: 'region', mask: new Uint8Array([255, 0]) } });
  await expect(retry).resolves.toMatchObject({ kind: 'region' });
  client.dispose();
  await expect(client.run(command)).rejects.toMatchObject({ code: 'cancelled' });
});
