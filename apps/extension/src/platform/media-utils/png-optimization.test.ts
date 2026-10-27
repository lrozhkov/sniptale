import { deflateSync, inflateSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { optimizePngBlob } from './png-optimization';

const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(data.length + 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  bytes.set(new TextEncoder().encode(type), 4);
  bytes.set(data, 8);
  view.setUint32(bytes.length - 4, crc32(bytes.subarray(4, -4)));
  return bytes;
}

function fixture(
  options: {
    width?: number;
    height?: number;
    alpha?: boolean;
    interlace?: number;
    pixel?: (x: number, y: number) => number[];
    metadata?: [string, Uint8Array][];
    raw?: Uint8Array;
  } = {}
): Blob {
  const width = options.width ?? 160;
  const height = options.height ?? 120;
  const channels = options.alpha === false ? 3 : 4;
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr.set([8, channels === 3 ? 2 : 6, 0, 0, options.interlace ?? 0], 8);
  const raw = options.raw ?? new Uint8Array(height * (width * channels + 1));
  if (!options.raw) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const rgba = options.pixel?.(x, y) ?? [40, 40, 40, 255];
        raw.set(rgba.slice(0, channels), y * (width * channels + 1) + 1 + x * channels);
      }
    }
  }
  return new Blob(
    [
      signature,
      chunk('IHDR', ihdr),
      ...(options.metadata ?? []).map(([type, data]) => chunk(type, data)),
      chunk('IDAT', Uint8Array.from(deflateSync(raw, { level: 0 }))),
      chunk('IEND', new Uint8Array()),
    ],
    { type: 'image/png' }
  );
}

async function inspect(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunks: { type: string; data: Uint8Array }[] = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = new DataView(bytes.buffer).getUint32(offset);
    const type = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8));
    const data = bytes.slice(offset + 8, offset + 8 + length);
    expect(new DataView(bytes.buffer).getUint32(offset + 8 + length)).toBe(
      crc32(bytes.subarray(offset + 4, offset + 8 + length))
    );
    chunks.push({ type, data });
    offset += length + 12;
  }
  const ihdr = chunks[0]!.data;
  const width = new DataView(ihdr.buffer).getUint32(0);
  const height = new DataView(ihdr.buffer).getUint32(4);
  const channels = ihdr[9] === 6 ? 4 : 3;
  const raw = inflateSync(
    Buffer.concat(chunks.filter((item) => item.type === 'IDAT').map((item) => item.data))
  );
  const rgba = new Uint8Array(width * height * 4);
  const rows = new Uint8Array(width * height * channels);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (width * channels + 1)]!;
    for (let x = 0; x < width * channels; x += 1) {
      const index = y * width * channels + x;
      const left = x >= channels ? rows[index - channels]! : 0;
      const up = y > 0 ? rows[index - width * channels]! : 0;
      const upperLeft = y > 0 && x >= channels ? rows[index - width * channels - channels]! : 0;
      const p = left + up - upperLeft;
      const pa = Math.abs(p - left);
      const pb = Math.abs(p - up);
      const pc = Math.abs(p - upperLeft);
      const predictor = [
        0,
        left,
        up,
        Math.floor((left + up) / 2),
        pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft,
      ][filter]!;
      rows[index] = raw[y * (width * channels + 1) + 1 + x]! + predictor;
    }
  }
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    rgba.set(rows.subarray(pixel * channels, pixel * channels + 3), pixel * 4);
    rgba[pixel * 4 + 3] = channels === 4 ? rows[pixel * channels + 3]! : 255;
  }
  return { chunks, rgba, channels, width, height };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('optimizePngBlob', () => {
  it('decodes each of the five browser PNG input filters', async () => {
    const width = 128;
    const height = 5;
    const stride = width * 4;
    const raw = new Uint8Array(height * (stride + 1));
    const expected = new Uint8Array(height * stride);
    for (let y = 0; y < height; y += 1) {
      raw[y * (stride + 1)] = y;
      for (let x = 0; x < stride; x += 1) {
        const value = x % 4 === 3 ? 128 : (x * 3 + y * 19) % 256;
        const left = x >= 4 ? expected[y * stride + x - 4]! : 0;
        const up = y > 0 ? expected[(y - 1) * stride + x]! : 0;
        const upperLeft = y > 0 && x >= 4 ? expected[(y - 1) * stride + x - 4]! : 0;
        const p = left + up - upperLeft;
        const a = Math.abs(p - left);
        const b = Math.abs(p - up);
        const c = Math.abs(p - upperLeft);
        const prediction = [
          0,
          left,
          up,
          Math.floor((left + up) / 2),
          a <= b && a <= c ? left : b <= c ? up : upperLeft,
        ][y]!;
        raw[y * (stride + 1) + 1 + x] = value - prediction;
        expected[y * stride + x] = value;
      }
    }
    const result = await optimizePngBlob(fixture({ width, height, raw }));
    expect((await inspect(result)).rgba).toEqual(expected);
  });

  it('validates zlib Adler checksum even when PNG chunk CRC is valid', async () => {
    const source = fixture();
    const decoded = await inspect(source);
    const parts = decoded.chunks.map(({ type, data }) => {
      const next = data.slice();
      if (type === 'IDAT') next[next.length - 1] = next[next.length - 1]! ^ 1;
      return chunk(type, next);
    });
    const corrupt = new Blob([signature, ...parts], { type: 'image/png' });
    expect(await optimizePngBlob(corrupt)).toBe(corrupt);
  });

  it('handles IDAT boundaries splitting the zlib header and trailer', async () => {
    const source = fixture();
    const decoded = await inspect(source);
    const parts = decoded.chunks.flatMap(({ type, data }) => {
      if (type !== 'IDAT') return [chunk(type, data)];
      return [
        data.subarray(0, 1),
        data.subarray(1, -3),
        data.subarray(-3, -2),
        data.subarray(-2),
      ].map((bytes) => chunk('IDAT', bytes));
    });
    const split = new Blob([signature, ...parts], { type: 'image/png' });
    const result = await optimizePngBlob(split);
    expect(result.size).toBeLessThan(split.size);
    expect((await inspect(result)).rgba).toEqual(decoded.rgba);
  });

  it('retains a source that exceeds the encoded input budget without reading it', async () => {
    const source = fixture();
    Object.defineProperty(source, 'size', { value: 33 * 1024 * 1024 });
    const reading = vi.spyOn(source, 'arrayBuffer');
    expect(await optimizePngBlob(source)).toBe(source);
    expect(reading).not.toHaveBeenCalled();
  });

  it('returns the source when the time budget expires', async () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(9000);
    const source = fixture();
    expect(await optimizePngBlob(source)).toBe(source);
    expect(clock).toHaveBeenCalledTimes(2);
  });

  it('observes cancellation after yielding during row processing', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled while processing');
    let tick = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (tick += 20));
    const source = fixture({ width: 1000, height: 100 });
    setTimeout(() => controller.abort(reason), 0);
    await expect(optimizePngBlob(source, controller.signal)).rejects.toBe(reason);
  });

  it('retains the source when native deflate is unavailable', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    const source = fixture();
    expect(await optimizePngBlob(source)).toBe(source);
  });

  it('retains unreadable input and non-PNG blobs', async () => {
    const unreadable = fixture();
    vi.spyOn(unreadable, 'arrayBuffer').mockRejectedValue(new Error('read failed'));
    expect(await optimizePngBlob(unreadable)).toBe(unreadable);
    const jpeg = new Blob(['jpeg'], { type: 'image/jpeg' });
    expect(await optimizePngBlob(jpeg)).toBe(jpeg);
  });

  it('reduces opaque browser PNG without changing decoded pixels', async () => {
    const source = fixture({ pixel: (x, y) => [x % 7, y % 9, x % 11, 255] });
    const result = await optimizePngBlob(source);
    expect(result.size).toBeLessThan(source.size / 4);
    const before = await inspect(source);
    const after = await inspect(result);
    expect(after.rgba).toEqual(before.rgba);
    expect(after.channels).toBe(3);
    expect([after.width, after.height]).toEqual([before.width, before.height]);
  });

  it('preserves alpha and hidden RGB in fully transparent pixels', async () => {
    const source = fixture({ pixel: (x) => [123, 45, 67, x % 3 === 0 ? 0 : 128] });
    const result = await optimizePngBlob(source);
    expect(result.size).toBeLessThan(source.size);
    expect((await inspect(result)).rgba).toEqual((await inspect(source)).rgba);
    expect((await inspect(result)).channels).toBe(4);
  });

  it.each(['bKGD', 'sBIT'])('retains RGBA when %s depends on color type', async (type) => {
    const data =
      type === 'sBIT' ? Uint8Array.from([8, 8, 8, 8]) : Uint8Array.from([0, 40, 0, 40, 0, 40]);
    const source = fixture({ metadata: [[type, data]] });
    const result = await optimizePngBlob(source);
    expect((await inspect(result)).channels).toBe(4);
    expect((await inspect(result)).chunks.find((item) => item.type === type)?.data).toEqual(data);
  });

  it('preserves color profiles and metadata bytes', async () => {
    const metadata: [string, Uint8Array][] = [
      ['sRGB', Uint8Array.of(0)],
      ['gAMA', Uint8Array.from([0, 0, 177, 143])],
      ['iCCP', Uint8Array.from([116, 101, 115, 116, 0, 0, ...deflateSync(Buffer.from('profile'))])],
      ['tEXt', new TextEncoder().encode('Title\0Screenshot')],
    ];
    const result = await optimizePngBlob(fixture({ metadata }));
    const decoded = await inspect(result);
    for (const [type, data] of metadata)
      expect(decoded.chunks.find((item) => item.type === type)?.data).toEqual(data);
  });

  it.each([
    { interlace: 1 },
    { metadata: [['acTL', new Uint8Array(8)]] as [string, Uint8Array][] },
    { metadata: [['dSIG', new Uint8Array(8)]] as [string, Uint8Array][] },
    { metadata: [['zzZZ', new Uint8Array(8)]] as [string, Uint8Array][] },
  ])('returns unsupported PNG unchanged: %j', async (options) => {
    const source = fixture(options);
    expect(await optimizePngBlob(source)).toBe(source);
  });

  it('returns tiny already compact PNG unchanged', async () => {
    const source = fixture({ width: 1, height: 1 });
    const compact = await optimizePngBlob(source);
    expect(await optimizePngBlob(compact)).toBe(compact);
  });

  it('returns corrupt CRC and corrupt deflate payloads unchanged', async () => {
    const valid = new Uint8Array(await fixture().arrayBuffer());
    valid[29] = valid[29]! ^ 1;
    const crcCorrupt = new Blob([valid], { type: 'image/png' });
    expect(await optimizePngBlob(crcCorrupt)).toBe(crcCorrupt);
    const truncated = new Blob([signature], { type: 'image/png' });
    expect(await optimizePngBlob(truncated)).toBe(truncated);
  });

  it('rejects rows exceeding declared size without replacing source', async () => {
    const source = fixture({ width: 1, height: 1, raw: new Uint8Array(1024 * 1024) });
    expect(await optimizePngBlob(source)).toBe(source);
  });

  it('checks declared decode budget before inflating', async () => {
    const source = fixture({ width: 1, height: 1 });
    const bytes = new Uint8Array(await source.arrayBuffer());
    const ihdr = bytes.slice(16, 29);
    new DataView(ihdr.buffer).setUint32(0, 32768);
    new DataView(ihdr.buffer).setUint32(4, 4097);
    const oversized = new Blob([signature, chunk('IHDR', ihdr), bytes.subarray(33)], {
      type: 'image/png',
    });
    expect(await optimizePngBlob(oversized)).toBe(oversized);
  });

  it('propagates cancellation and source-read cancellation', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled');
    controller.abort(reason);
    await expect(optimizePngBlob(fixture(), controller.signal)).rejects.toBe(reason);
    const active = new AbortController();
    const source = fixture();
    const reading = source.arrayBuffer.bind(source);
    source.arrayBuffer = async () => {
      const bytes = await reading();
      active.abort(reason);
      return bytes;
    };
    await expect(optimizePngBlob(source, active.signal)).rejects.toBe(reason);
  });
});
