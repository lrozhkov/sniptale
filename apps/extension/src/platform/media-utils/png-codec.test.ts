import { deflateSync, inflateSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodePngRgba, encodePngRgba, readBrowserPng } from './png-codec';

const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

function chunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const output = new Uint8Array(data.length + 12);
  output.set(new TextEncoder().encode(type), 4);
  output.set(data, 8);
  let crc = 0xffffffff;
  for (const value of output.subarray(4, -4)) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const view = new DataView(output.buffer);
  view.setUint32(0, data.length);
  view.setUint32(output.length - 4, (crc ^ 0xffffffff) >>> 0);
  return output;
}

async function fixture({
  width = 2,
  height = 1,
  channels = 4,
  raw = Uint8Array.from([0, 123, 45, 67, 0, 19, 203, 57, 1]),
  compressed = Uint8Array.from(deflateSync(raw)),
  metadata = [],
  split = false,
  interlace = 0,
}: {
  width?: number;
  height?: number;
  channels?: 3 | 4;
  raw?: Uint8Array;
  compressed?: Uint8Array;
  metadata?: [string, Uint8Array][];
  split?: boolean;
  interlace?: number;
} = {}) {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, channels === 4 ? 6 : 2, 0, 0, interlace], 8);
  const pieces = split ? Array.from(compressed, (value) => Uint8Array.of(value)) : [compressed];
  return new Uint8Array(
    await new Blob([
      signature,
      chunk('IHDR', header),
      ...metadata.map(([type, data]) => chunk(type, data)),
      ...pieces.map((data) => chunk('IDAT', data)),
      chunk('IEND', new Uint8Array()),
    ]).arrayBuffer()
  );
}

afterEach(() => vi.restoreAllMocks());

describe('PNG raw RGBA codec', () => {
  it('roundtrips exact hidden RGB and low alpha without modifying caller arrays', async () => {
    const rgba = Uint8ClampedArray.from([
      123, 45, 67, 0, 19, 203, 57, 1, 254, 129, 3, 5, 1, 127, 255, 127, 91, 17, 33, 255,
    ]);
    const original = rgba.slice();
    const blob = await encodePngRgba({ width: 5, height: 1, rgba });
    expect(blob.type).toBe('image/png');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const source = bytes.slice();
    const png = readBrowserPng(bytes, 21)!;
    expect(png.channels).toBe(4);
    expect(png.chunks[0]!.type).toBe('IHDR');
    expect(png.chunks.at(-1)!.type).toBe('IEND');
    expect(png.chunks.slice(1, -1).every(({ type }) => type === 'IDAT')).toBe(true);
    expect(inflateSync(Buffer.concat(png.imageData))).toHaveLength(21);
    expect(await decodePngRgba({ width: 5, height: 1, bytes })).toEqual(rgba);
    expect(rgba).toEqual(original);
    expect(bytes).toEqual(source);
  });

  it('decodes all five PNG filters across partial compressed chunks and row boundaries', async () => {
    const width = 3;
    const height = 5;
    const stride = width * 4;
    const expected = Uint8ClampedArray.from({ length: stride * height }, (_, i) => (i * 43) % 256);
    const raw = new Uint8Array((stride + 1) * height);
    for (let y = 0; y < height; y += 1) {
      raw[y * (stride + 1)] = y;
      for (let x = 0; x < stride; x += 1) {
        const left = x >= 4 ? expected[y * stride + x - 4]! : 0;
        const up = y > 0 ? expected[(y - 1) * stride + x]! : 0;
        const corner = y > 0 && x >= 4 ? expected[(y - 1) * stride + x - 4]! : 0;
        const p = left + up - corner;
        const a = Math.abs(p - left);
        const b = Math.abs(p - up);
        const c = Math.abs(p - corner);
        const prediction = [
          0,
          left,
          up,
          (left + up) >>> 1,
          a <= b && a <= c ? left : b <= c ? up : corner,
        ][y]!;
        raw[y * (stride + 1) + x + 1] = expected[y * stride + x]! - prediction;
      }
    }
    expect(
      await decodePngRgba({
        bytes: await fixture({ width, height, raw, split: true }),
        width,
        height,
      })
    ).toEqual(expected);
  });

  it('roundtrips multiple adaptive rows through bounded stream chunks', async () => {
    const width = 257;
    const height = 71;
    const rgba = Uint8ClampedArray.from(
      { length: width * height * 4 },
      (_, index) => (index * 37 + (index >>> 8)) % 256
    );
    const bytes = new Uint8Array(
      await (await encodePngRgba({ width, height, rgba })).arrayBuffer()
    );
    expect(await decodePngRgba({ bytes, width, height })).toEqual(rgba);
  });

  it.each([255, 254])(
    'uses RGB only when all input alpha bytes are opaque: %i',
    async (lastAlpha) => {
      const width = 3;
      const height = 2;
      const rgba = Uint8ClampedArray.from([
        123,
        45,
        67,
        255,
        19,
        203,
        57,
        255,
        17,
        33,
        91,
        255,
        21,
        243,
        11,
        255,
        203,
        4,
        19,
        255,
        71,
        88,
        103,
        lastAlpha,
      ]);
      const original = rgba.slice();
      const bytes = new Uint8Array(
        await (await encodePngRgba({ width, height, rgba })).arrayBuffer()
      );
      const png = readBrowserPng(bytes, (width * 4 + 1) * height)!;
      const channels = lastAlpha === 255 ? 3 : 4;
      expect(png.channels).toBe(channels);
      expect(inflateSync(Buffer.concat(png.imageData))).toHaveLength(
        (width * channels + 1) * height
      );
      expect(await decodePngRgba({ bytes, width, height })).toEqual(original);
      expect(rgba).toEqual(original);
    }
  );

  it('supplies opaque alpha for RGB bytes', async () => {
    const bytes = await fixture({ channels: 3, raw: Uint8Array.of(0, 123, 45, 67, 19, 203, 57) });
    expect(await decodePngRgba({ bytes, width: 2, height: 1 })).toEqual(
      Uint8ClampedArray.of(123, 45, 67, 255, 19, 203, 57, 255)
    );
  });

  it.each(['tRNS', 'iCCP', 'cICP', 'gAMA', 'cHRM', 'sBIT', 'mDCV', 'cLLI'])(
    'rejects unsupported %s interpretation',
    async (type) => {
      const bytes = await fixture({ metadata: [[type, Uint8Array.of(0)]] });
      await expect(decodePngRgba({ bytes, width: 2, height: 1 })).rejects.toThrow('profile');
    }
  );

  it('accepts standard sRGB and rejects invalid profiles and interlaced PNG', async () => {
    const bytes = await fixture({ metadata: [['sRGB', Uint8Array.of(0)]] });
    expect(await decodePngRgba({ bytes, width: 2, height: 1 })).toHaveLength(8);
    for (const invalid of [
      await fixture({ metadata: [['sRGB', Uint8Array.of(4)]] }),
      await fixture({ interlace: 1 }),
    ])
      await expect(decodePngRgba({ bytes: invalid, width: 2, height: 1 })).rejects.toThrow();
  });

  it('rejects invalid caller dimensions and byte counts before streaming', async () => {
    const bytes = await fixture();
    const streaming = vi.spyOn(globalThis, 'DecompressionStream');
    for (const [width, height] of [
      [0, 1],
      [1.5, 1],
      [32769, 1],
      [10001, 10000],
      [1, 1],
      [2, 2],
    ])
      await expect(decodePngRgba({ bytes, width: width!, height: height! })).rejects.toThrow();
    expect(streaming).not.toHaveBeenCalled();
    await expect(
      encodePngRgba({ width: 2, height: 1, rgba: new Uint8ClampedArray(7) })
    ).rejects.toThrow('byte count');
  });

  it('rejects corrupt CRC and declared oversized dimensions before streaming', async () => {
    const bytes = await fixture();
    bytes[29] = bytes[29]! ^ 1;
    const streaming = vi.spyOn(globalThis, 'DecompressionStream');
    await expect(decodePngRgba({ bytes, width: 2, height: 1 })).rejects.toThrow();
    const oversized = await fixture({ width: 32768, height: 32768 });
    await expect(decodePngRgba({ bytes: oversized, width: 2, height: 1 })).rejects.toThrow();
    expect(streaming).not.toHaveBeenCalled();
  });

  it.each(['checksum', 'truncated', 'trailing', 'overlong', 'short', 'filter'])(
    'rejects %s streams without modifying input',
    async (kind) => {
      let compressed = Uint8Array.from(deflateSync(Uint8Array.of(0, 1, 2, 3, 4, 5, 6, 7, 8)));
      if (kind === 'checksum')
        compressed[compressed.length - 1] = compressed[compressed.length - 1]! ^ 1;
      if (kind === 'truncated') compressed = compressed.slice(0, -1);
      if (kind === 'trailing') compressed = Uint8Array.from([...compressed, 0]);
      if (kind === 'overlong') compressed = Uint8Array.from(deflateSync(new Uint8Array(100000)));
      if (kind === 'short') compressed = Uint8Array.from(deflateSync(Uint8Array.of(0, 1)));
      if (kind === 'filter')
        compressed = Uint8Array.from(deflateSync(Uint8Array.of(5, 1, 2, 3, 4, 5, 6, 7, 8)));
      const bytes = await fixture({ compressed });
      const original = bytes.slice();
      await expect(decodePngRgba({ bytes, width: 2, height: 1 })).rejects.toThrow();
      expect(bytes).toEqual(original);
    }
  );

  it('propagates prior and active cancellation while preserving source arrays', async () => {
    const prior = new AbortController();
    const reason = new Error('cancelled raw PNG work');
    prior.abort(reason);
    const rgba = new Uint8ClampedArray(1024 * 128 * 4).fill(17);
    const original = rgba.slice();
    await expect(
      encodePngRgba({ width: 1024, height: 128, rgba, signal: prior.signal })
    ).rejects.toBe(reason);
    const bytes = await fixture();
    await expect(decodePngRgba({ bytes, width: 2, height: 1, signal: prior.signal })).rejects.toBe(
      reason
    );
    vi.spyOn(performance, 'now').mockImplementation(
      () => 100 * vi.mocked(performance.now).mock.calls.length
    );
    const activeEncode = new AbortController();
    setTimeout(() => activeEncode.abort(reason), 0);
    await expect(
      encodePngRgba({ width: 1024, height: 128, rgba, signal: activeEncode.signal })
    ).rejects.toBe(reason);
    const activeDecode = new AbortController();
    setTimeout(() => activeDecode.abort(reason), 0);
    await expect(
      decodePngRgba({ bytes, width: 2, height: 1, signal: activeDecode.signal })
    ).rejects.toBe(reason);
    expect(rgba).toEqual(original);
  });
});
