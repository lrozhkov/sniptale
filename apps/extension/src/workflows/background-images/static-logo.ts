import { prepareBackgroundSvg } from './intake';

const MAX_BYTES = 16 * 1024 * 1024;
const MAX_SVG_BYTES = 2 * 1024 * 1024;
const MAX_AXIS = 4096;
const MAX_PIXELS = 16_000_000;
type StaticLogoFailure = 'invalid' | 'size' | 'dimensions' | 'animated' | 'decode' | 'encode';

/** Fixed admission reasons let consumers localize errors without exposing file contents. */
export class StaticLogoError extends Error {
  constructor(public readonly code: StaticLogoFailure) {
    super(`static-logo:${code}`);
    this.name = 'StaticLogoError';
  }
}
function fail(code: StaticLogoFailure): never {
  throw new StaticLogoError(code);
}
function dimensions(width: number, height: number) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_AXIS ||
    height > MAX_AXIS ||
    width * height > MAX_PIXELS
  )
    fail('dimensions');
}
function tag(bytes: Uint8Array, at: number, count = 4) {
  return String.fromCharCode(...bytes.subarray(at, at + count));
}
function pngDimensions(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8,
    header = false,
    pixels = false,
    ended = false;
  while (at < bytes.length) {
    if (at + 12 > bytes.length) fail('invalid');
    const length = view.getUint32(at),
      kind = tag(bytes, at + 4);
    if (length > bytes.length - at - 12) fail('invalid');
    if (kind === 'acTL' || kind === 'fcTL' || kind === 'fdAT') fail('animated');
    if (!header && kind !== 'IHDR') fail('invalid');
    if (kind === 'IHDR') {
      if (header || length !== 13) fail('invalid');
      dimensions(view.getUint32(at + 8), view.getUint32(at + 12));
      header = true;
    }
    if (kind === 'IDAT') pixels = true;
    at += length + 12;
    if (kind === 'IEND') {
      if (length !== 0 || at !== bytes.length) fail('invalid');
      ended = true;
      break;
    }
  }
  if (!header || !pixels || !ended) fail('invalid');
}
function jpegDimensions(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 2,
    header = false;
  while (at < bytes.length) {
    if (bytes[at++] !== 255) fail('invalid');
    while (bytes[at] === 255) at++;
    const marker = bytes[at++];
    if (marker === undefined || marker === 0 || marker === 216 || marker === 217) fail('invalid');
    if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
    if (at + 2 > bytes.length) fail('invalid');
    const length = view.getUint16(at);
    if (length < 2 || length > bytes.length - at) fail('invalid');
    if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker)) {
      if (length < 8) fail('invalid');
      dimensions(view.getUint16(at + 5), view.getUint16(at + 3));
      header = true;
    }
    if (marker === 218) {
      if (!header || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) fail('invalid');
      return;
    }
    at += length;
  }
  fail('invalid');
}
function webpDimensions(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 12 || view.getUint32(4, true) !== bytes.length - 8) fail('invalid');
  const uint24 = (at: number) => bytes[at]! + bytes[at + 1]! * 256 + bytes[at + 2]! * 65536;
  let at = 12,
    pixels = false;
  while (at < bytes.length) {
    if (at + 8 > bytes.length) fail('invalid');
    const kind = tag(bytes, at),
      length = view.getUint32(at + 4, true),
      start = at + 8;
    if (length > bytes.length - start || length + (length % 2) > bytes.length - start)
      fail('invalid');
    if (kind === 'ANIM' || kind === 'ANMF') fail('animated');
    if (kind === 'VP8X') {
      if (length !== 10) fail('invalid');
      if ((bytes[start]! & 2) !== 0) fail('animated');
      dimensions(uint24(start + 4) + 1, uint24(start + 7) + 1);
    }
    if (kind === 'VP8 ' || kind === 'VP8L') {
      if (pixels) fail('invalid');
      pixels = true;
      if (kind === 'VP8 ') {
        if (length < 10 || tag(bytes, start + 3, 3) !== '\x9d\x01\x2a') fail('invalid');
        dimensions(
          view.getUint16(start + 6, true) & 0x3fff,
          view.getUint16(start + 8, true) & 0x3fff
        );
      } else {
        if (length < 5 || bytes[start] !== 0x2f) fail('invalid');
        const bits = view.getUint32(start + 1, true);
        dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
      }
    }
    at = start + length + (length % 2);
  }
  if (!pixels) fail('invalid');
}
function rasterType(bytes: Uint8Array): string | null {
  if (tag(bytes, 0, 6) === 'GIF87a' || tag(bytes, 0, 6) === 'GIF89a') fail('animated');
  if (tag(bytes, 0, 8) === '\x89PNG\r\n\x1a\n') {
    pngDimensions(bytes);
    return 'image/png';
  }
  if (bytes[0] === 255 && bytes[1] === 216) {
    jpegDimensions(bytes);
    return 'image/jpeg';
  }
  if (tag(bytes, 0) === 'RIFF' && tag(bytes, 8) === 'WEBP') {
    webpDimensions(bytes);
    return 'image/webp';
  }
  return null;
}
function cssWithoutEscapes(css: string) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(
      /\\([0-9a-f]{1,6})\s?|\\([^\r\n])/gi,
      (_match, hex: string | undefined, character: string | undefined) =>
        hex ? String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff)) : (character ?? '')
    );
}
function staticSvg(bytes: Uint8Array) {
  if (bytes.length > MAX_SVG_BYTES) fail('size');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return fail('invalid');
  }
  const original = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (original.querySelector('parsererror') || original.documentElement.localName !== 'svg')
    fail('invalid');
  for (const element of original.querySelectorAll('*')) {
    if (
      ['animate', 'animatemotion', 'animatetransform', 'animatecolor', 'set', 'discard'].includes(
        element.localName.toLowerCase()
      )
    )
      fail('animated');
    const css = cssWithoutEscapes(
      `${element.getAttribute('style') ?? ''} ${element.localName === 'style' ? element.textContent : ''}`
    );
    if (/animation|@(?:-webkit-)?keyframes/i.test(css)) fail('animated');
  }
  let clean: string;
  try {
    clean = prepareBackgroundSvg(text);
  } catch {
    return fail('dimensions');
  }
  const document = new DOMParser().parseFromString(clean, 'image/svg+xml');
  const root = document.documentElement;
  const width = Number(root.getAttribute('width')),
    height = Number(root.getAttribute('height'));
  dimensions(width, height);
  const scale = Math.min(
    MAX_AXIS / Math.max(width, height),
    Math.sqrt(MAX_PIXELS / (width * height))
  );
  const output = {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
  dimensions(output.width, output.height);
  if (!root.hasAttribute('viewBox')) root.setAttribute('viewBox', `0 0 ${width} ${height}`);
  root.setAttribute('width', String(output.width));
  root.setAttribute('height', String(output.height));
  return { ...output, text: new XMLSerializer().serializeToString(root) };
}
async function decodeVector(image: HTMLImageElement, signal?: AbortSignal) {
  signal?.throwIfAborted();
  let abort: (() => void) | undefined;
  try {
    await Promise.race([
      image.decode(),
      new Promise<never>((_resolve, reject) => {
        abort = () => {
          image.src = '';
          reject(signal?.reason);
        };
        signal?.addEventListener('abort', abort, { once: true });
      }),
    ]);
  } catch {
    signal?.throwIfAborted();
    fail('decode');
  } finally {
    if (abort) signal?.removeEventListener('abort', abort);
  }
}
async function rasterizeSvg(file: File, bytes: Uint8Array, signal?: AbortSignal) {
  const svg = staticSvg(bytes);
  const url = URL.createObjectURL(new Blob([svg.text], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await decodeVector(image, signal);
    signal?.throwIfAborted();
    dimensions(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = svg.width;
    canvas.height = svg.height;
    const context = canvas.getContext('2d');
    if (!context) fail('decode');
    context.drawImage(image, 0, 0, svg.width, svg.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new StaticLogoError('encode'))),
        'image/png'
      )
    );
    signal?.throwIfAborted();
    if (!blob.size || blob.size > MAX_BYTES) fail('size');
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.png', { type: 'image/png' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Static-logo admission runs on original acquisition bytes before any background normalization. */
export async function prepareStaticLogo(file: File, signal?: AbortSignal): Promise<File> {
  signal?.throwIfAborted();
  if (!file.size || file.size > MAX_BYTES) fail('size');
  const bytes = new Uint8Array(await file.arrayBuffer());
  signal?.throwIfAborted();
  const type = rasterType(bytes);
  if (!type) return rasterizeSvg(file, bytes, signal);
  const admitted = new File([file], file.name, { type });
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(admitted);
  } catch {
    signal?.throwIfAborted();
    return fail('decode');
  }
  try {
    signal?.throwIfAborted();
    dimensions(bitmap.width, bitmap.height);
    return admitted;
  } finally {
    bitmap.close();
  }
}
