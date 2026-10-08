// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { prepareStaticLogo } from './static-logo';

function file(bytes: Uint8Array | string, type = 'image/png') {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  const result = new File([new Uint8Array(data).buffer], 'logo.bin', { type });
  Object.defineProperty(result, 'arrayBuffer', { value: async () => data.slice().buffer });
  return result;
}
function chunk(name: string, payload: Uint8Array) {
  const bytes = new Uint8Array(payload.length + 12);
  new DataView(bytes.buffer).setUint32(0, payload.length);
  bytes.set(new TextEncoder().encode(name), 4);
  bytes.set(payload, 8);
  return bytes;
}
function png(width = 32, height = 16, animated = false) {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 6], 8);
  return new Uint8Array([
    137,
    80,
    78,
    71,
    13,
    10,
    26,
    10,
    ...chunk('IHDR', header),
    ...(animated ? chunk('acTL', new Uint8Array(8)) : []),
    ...chunk('IDAT', new Uint8Array([1])),
    ...chunk('IEND', new Uint8Array()),
  ]);
}
function webp(animated = false) {
  const bytes = new Uint8Array(30);
  bytes.set(new TextEncoder().encode('RIFF'));
  new DataView(bytes.buffer).setUint32(4, 22, true);
  bytes.set(new TextEncoder().encode('WEBPVP8L'), 8);
  new DataView(bytes.buffer).setUint32(16, 5, true);
  bytes.set([0x2f, 31, 0xc0, 3, 0], 20);
  if (animated) bytes.set(new TextEncoder().encode('ANIM'), 12);
  return bytes.slice(0, 26).map((value, index) => (index === 4 ? 18 : value));
}
const close = vi.fn();
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  close.mockReset();
});
function decoder(width = 32, height = 16) {
  const decode = vi.fn().mockResolvedValue({ width, height, close });
  vi.stubGlobal('createImageBitmap', decode);
  return decode;
}
it('admits actual PNG/JPEG/WebP bytes regardless of claimed type and verifies decoding', async () => {
  const decode = decoder();
  const jpeg = new Uint8Array([
    255, 216, 255, 192, 0, 11, 8, 0, 16, 0, 32, 1, 1, 17, 0, 255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 1,
    255, 217,
  ]);
  for (const [bytes, mime] of [
    [png(), 'image/png'],
    [jpeg, 'image/jpeg'],
    [webp(), 'image/webp'],
  ] as const) {
    const result = await prepareStaticLogo(file(bytes, 'text/plain'));
    expect(result.type).toBe(mime);
    expect(result.size).toBe(bytes.length);
  }
  expect(decode).toHaveBeenCalledTimes(3);
  expect(close).toHaveBeenCalledTimes(3);
});
it('rejects animation, malformed containers and oversized raster headers before decoding', async () => {
  const decode = decoder();
  for (const input of [file('GIF89a'), file(png(32, 16, true)), file(webp(true))])
    await expect(prepareStaticLogo(input)).rejects.toMatchObject({ code: 'animated' });
  for (const bytes of [png().slice(0, -2), webp().slice(0, -1), new Uint8Array([1, 2, 3])])
    await expect(prepareStaticLogo(file(bytes))).rejects.toMatchObject({ code: 'invalid' });
  for (const bytes of [png(4097, 1), png(4096, 4096), png(0, 1)])
    await expect(prepareStaticLogo(file(bytes))).rejects.toMatchObject({ code: 'dimensions' });
  expect(decode).not.toHaveBeenCalled();
});
it('checks byte budgets, decoded bounds, decoder failure and cancellation without leaking bitmaps', async () => {
  const oversized = file(png());
  Object.defineProperty(oversized, 'size', { value: 16 * 1024 * 1024 + 1 });
  const decode = decoder(4096, 4096);
  await expect(prepareStaticLogo(oversized)).rejects.toMatchObject({ code: 'size' });
  await expect(prepareStaticLogo(file(png()))).rejects.toMatchObject({ code: 'dimensions' });
  expect(close).toHaveBeenCalledOnce();
  decode.mockRejectedValueOnce(new Error('codec'));
  await expect(prepareStaticLogo(file(png()))).rejects.toMatchObject({ code: 'decode' });
  const controller = new AbortController();
  decode.mockImplementationOnce(async () => {
    controller.abort();
    return { width: 32, height: 16, close };
  });
  await expect(prepareStaticLogo(file(png()), controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(close).toHaveBeenCalledTimes(2);
  await expect(prepareStaticLogo(file(png()), controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
});
it('rejects SVG animation before sanitizer removes it and rejects unbounded vectors', async () => {
  decoder();
  for (const body of [
    '<animate attributeName="x"/>',
    '<set attributeName="fill"/>',
    '<style>@keyframes pulse {}</style>',
    '<rect style="animation: pulse 1s"/>',
  ])
    await expect(
      prepareStaticLogo(
        file(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="5">${body}</svg>`)
      )
    ).rejects.toMatchObject({ code: 'animated' });
  await expect(prepareStaticLogo(file('<svg width="999999" height="1"/>'))).rejects.toMatchObject({
    code: 'dimensions',
  });
});
it('sanitizes a small SVG and normalizes at bounded 4K aspect dimensions before decoding', async () => {
  let decoded: Blob | undefined;
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: (blob: Blob) => {
        decoded = blob;
        return 'blob:logo';
      },
      revokeObjectURL: vi.fn(),
    })
  );
  vi.stubGlobal(
    'Image',
    class {
      src = '';
      naturalWidth = 4096;
      naturalHeight = 2048;
      decode = async () => undefined;
    }
  );
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback) {
    callback(new Blob([png()], { type: 'image/png' }));
  });
  const result = await prepareStaticLogo(
    file(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="5"><script>evil()</script><image href="https://evil.test/a"/><rect width="10" height="5"/></svg>'
    )
  );
  expect(result.type).toBe('image/png');
  const text = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(decoded!);
  });
  expect(text).toContain('width="4096"');
  expect(text).toContain('height="2048"');
  expect(text).not.toMatch(/evil|https:/);
  expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 4096, 2048);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:logo');
});

it('rejects every WebP animation marker and malformed declared chunk lengths before decode', async () => {
  const decode = decoder();
  const extended = (kind: string, payload: Uint8Array) => {
    const result = new Uint8Array(20 + payload.length + (payload.length % 2));
    result.set(new TextEncoder().encode('RIFF'));
    new DataView(result.buffer).setUint32(4, result.length - 8, true);
    result.set(new TextEncoder().encode('WEBP' + kind), 8);
    new DataView(result.buffer).setUint32(16, payload.length, true);
    result.set(payload, 20);
    return result;
  };
  for (const bytes of [
    extended('ANMF', new Uint8Array(16)),
    extended('VP8X', new Uint8Array([2, 0, 0, 0, 31, 0, 0, 15, 0, 0])),
  ])
    await expect(prepareStaticLogo(file(bytes))).rejects.toMatchObject({ code: 'animated' });
  const malformed = webp();
  new DataView(malformed.buffer).setUint32(16, 0xffffffff, true);
  await expect(prepareStaticLogo(file(malformed))).rejects.toMatchObject({ code: 'invalid' });
  const malformedPng = png();
  new DataView(malformedPng.buffer).setUint32(8, 0xffffffff);
  await expect(prepareStaticLogo(file(malformedPng))).rejects.toMatchObject({ code: 'invalid' });
  expect(decode).not.toHaveBeenCalled();
});
it('detects escaped CSS animation and bounds SVG bytes before browser decoding', async () => {
  decoder();
  await expect(
    prepareStaticLogo(
      file('<svg width="10" height="5"><rect style="anim\\61 tion: pulse 1s"/></svg>')
    )
  ).rejects.toMatchObject({ code: 'animated' });
  await expect(
    prepareStaticLogo(file('<svg width="10" height="5">' + ' '.repeat(2 * 1024 * 1024) + '</svg>'))
  ).rejects.toMatchObject({ code: 'size' });
});
it('bounds normalized square SVG and output bytes, and releases the URL on encoding failure', async () => {
  const revoke = vi.fn(),
    drawImage = vi.fn();
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: () => 'blob:square', revokeObjectURL: revoke })
  );
  vi.stubGlobal(
    'Image',
    class {
      src = '';
      naturalWidth = 4000;
      naturalHeight = 4000;
      decode = async () => undefined;
    }
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  const encode = vi
    .spyOn(HTMLCanvasElement.prototype, 'toBlob')
    .mockImplementation((callback) => callback(null));
  const svg = () => file('<svg width="10" height="10"/>');
  await expect(prepareStaticLogo(svg())).rejects.toMatchObject({ code: 'encode' });
  expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 4000, 4000);
  const blob = new Blob(['large']);
  Object.defineProperty(blob, 'size', { value: 16 * 1024 * 1024 + 1 });
  encode.mockImplementation((callback) => callback(blob));
  await expect(prepareStaticLogo(svg())).rejects.toMatchObject({ code: 'size' });
  expect(revoke).toHaveBeenCalledTimes(2);
});
it('cancels pending SVG decode and revokes its temporary URL', async () => {
  const revoke = vi.fn(),
    controller = new AbortController();
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: () => 'blob:pending', revokeObjectURL: revoke })
  );
  vi.stubGlobal(
    'Image',
    class {
      src = '';
      decode = () => {
        queueMicrotask(() => controller.abort());
        return new Promise<void>(() => undefined);
      };
    }
  );
  await expect(
    prepareStaticLogo(file('<svg width="10" height="5"/>'), controller.signal)
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(revoke).toHaveBeenCalledWith('blob:pending');
});
