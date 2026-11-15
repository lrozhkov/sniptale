import { afterEach, expect, it, vi } from 'vitest';
import { createRasterComputeClient, type RasterWorker } from './compute';
import { createEditorRasterMetadata } from './image-state';
import { encodePngRgba } from '../../platform/media-utils/png-codec';

async function workerTransport() {
  const ingress = new EventTarget(),
    replies = new EventTarget();
  let alive = true;
  const post = vi.fn((value: unknown) => {
    if (alive) replies.dispatchEvent(new MessageEvent('message', { data: structuredClone(value) }));
  });
  vi.stubGlobal('self', {
    addEventListener: ingress.addEventListener.bind(ingress),
    postMessage: post,
  });
  vi.resetModules();
  await import('./worker');
  const worker: RasterWorker = {
    postMessage: vi.fn((value: unknown, options?: StructuredSerializeOptions | Transferable[]) => {
      const transfer = Array.isArray(options) ? options : options?.transfer;
      const data = structuredClone(value, transfer ? { transfer } : undefined);
      if (alive) ingress.dispatchEvent(new MessageEvent('message', { data }));
    }),
    terminate: vi.fn(() => {
      alive = false;
    }),
    addEventListener: replies.addEventListener.bind(replies),
    removeEventListener: replies.removeEventListener.bind(replies),
  };
  return {
    worker,
    post,
    send(value: unknown) {
      ingress.dispatchEvent(new MessageEvent('message', { data: structuredClone(value) }));
    },
    reply() {
      return new Promise<unknown>((resolve) =>
        replies.addEventListener(
          'message',
          (event) => {
            if (event instanceof MessageEvent) resolve(event.data);
          },
          { once: true }
        )
      );
    },
  };
}
afterEach(() => vi.unstubAllGlobals());
it('runs the real Worker ingress and client across cloned messages without detaching accepted planes', async () => {
  const transport = await workerTransport(),
    client = createRasterComputeClient({ createWorker: () => transport.worker });
  const color = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]);
  const bytes = await encodePngRgba({ width: 2, height: 1, rgba: color });
  const source = `data:image/png;base64,${Buffer.from(await bytes.arrayBuffer()).toString('base64')}`;
  const metadata = createEditorRasterMetadata(source, 2, 1),
    planes = { width: 2, height: 1, color, visibility: null, key: null };
  const decoded = await client.run({ kind: 'decode', metadata });
  expect(decoded.kind === 'decoded' && decoded.pixels.color).toEqual(color);
  const region = await client.run({
    kind: 'region',
    pixels: planes,
    selection: null,
    seed: { x: 0, y: 0 },
    tolerance: 0,
    grow: 0,
    contiguous: true,
  });
  expect(region).toEqual({ kind: 'region', mask: new Uint8Array([255, 0]) });
  const fragment = await client.run({
    kind: 'fragment',
    pixels: planes,
    selection: new Uint8Array([255, 0]),
    bounds: { x: 0, y: 0, width: 1, height: 1 },
  });
  expect(fragment.kind === 'fragment' && fragment.dataUrl).toMatch(/^data:image\/png;/);
  const encoded = await client.run({ kind: 'encode', metadata, before: planes, after: planes });
  expect(encoded.kind === 'encoded' && encoded.candidate.visibleFullDataUrl).toBe(source);
  expect(color.byteLength).toBe(8);
  expect(color).toEqual(new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]));
  expect(transport.worker.postMessage).toHaveBeenCalledTimes(4);
  expect(transport.post).toHaveBeenCalledTimes(4);
  client.dispose();
});
it('ignores malformed envelopes and returns only fixed failure codes for admitted request ids', async () => {
  const transport = await workerTransport();
  for (const value of [
    null,
    42,
    {},
    { id: 1 },
    { id: 0, command: {} },
    { id: 1.5, command: {} },
    { id: '1', command: {} },
  ])
    transport.send(value);
  const invalid = transport.reply();
  transport.send({
    id: 7,
    command: {
      kind: 'decode',
      metadata: { sniptaleRasterOriginalData: 'https://private.invalid/source' },
    },
  });
  await expect(invalid).resolves.toEqual({ id: 7, ok: false, code: 'invalid-command' });
  expect(transport.post).toHaveBeenCalledOnce();
  const failure = transport.reply();
  transport.send({
    id: 8,
    command: {
      kind: 'decode',
      metadata: createEditorRasterMetadata('data:image/png;base64,QUJDRA==', 1, 1),
    },
  });
  await expect(failure).resolves.toEqual({ id: 8, ok: false, code: 'compute-failed' });
  expect(transport.post).toHaveBeenCalledTimes(2);
});
