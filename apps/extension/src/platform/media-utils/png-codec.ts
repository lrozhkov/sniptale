const SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const KNOWN_CRITICAL = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND']);
const KNOWN_METADATA = new Set([
  'cHRM',
  'gAMA',
  'iCCP',
  'sBIT',
  'sRGB',
  'bKGD',
  'hIST',
  'tRNS',
  'pHYs',
  'sPLT',
  'tIME',
  'iTXt',
  'tEXt',
  'zTXt',
  'eXIf',
  'cICP',
  'mDCV',
  'cLLI',
]);
const BLOCKED_CHUNKS = new Set(['acTL', 'fcTL', 'fdAT', 'dSIG']);
const COLOR_TYPE_METADATA = new Set(['tRNS', 'bKGD', 'sBIT']);
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});

interface PngChunk {
  type: string;
  data: Uint8Array;
  encoded: Uint8Array;
}

export interface BrowserPng {
  width: number;
  height: number;
  channels: 3 | 4;
  canRemoveAlpha: boolean;
  chunks: PngChunk[];
  imageData: Uint8Array[];
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const value of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ value) & 255]!;
  return (crc ^ 0xffffffff) >>> 0;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
}

/** Parses the supported browser PNG subset without changing ancillary chunk bytes. */
export function readBrowserPng(bytes: Uint8Array, maxFilteredBytes: number): BrowserPng | null {
  if (!SIGNATURE.every((value, index) => bytes[index] === value)) return null;
  const chunks: PngChunk[] = [];
  const imageData: Uint8Array[] = [];
  let offset = 8;
  let endedImageData = false;
  let ended = false;
  while (offset + 12 <= bytes.length && chunks.length < 10_000) {
    const length = readUint32(bytes, offset);
    const end = offset + length + 12;
    if (end > bytes.length) return null;
    const typeBytes = bytes.subarray(offset + 4, offset + 8);
    if (!typeBytes.every((value) => (value >= 65 && value <= 90) || (value >= 97 && value <= 122)))
      return null;
    const type = String.fromCharCode(...typeBytes);
    if (BLOCKED_CHUNKS.has(type)) return null;
    const critical = (typeBytes[0]! & 32) === 0;
    const unsafeToCopy = (typeBytes[3]! & 32) === 0;
    if (
      (critical && !KNOWN_CRITICAL.has(type)) ||
      (!critical && unsafeToCopy && !KNOWN_METADATA.has(type))
    )
      return null;
    if (readUint32(bytes, end - 4) !== crc32(bytes.subarray(offset + 4, end - 4))) return null;
    if (type === 'IHDR' && chunks.length !== 0) return null;
    const data = bytes.subarray(offset + 8, end - 4);
    chunks.push({ type, data, encoded: bytes.subarray(offset, end) });
    if (type === 'IDAT') {
      if (endedImageData) return null;
      imageData.push(data);
    } else if (imageData.length > 0) endedImageData = true;
    offset = end;
    if (type === 'IEND') {
      ended = length === 0;
      break;
    }
  }
  const header = chunks[0];
  if (
    !ended ||
    offset !== bytes.length ||
    header?.type !== 'IHDR' ||
    header.data.length !== 13 ||
    imageData.length === 0
  )
    return null;
  const width = readUint32(header.data, 0);
  const height = readUint32(header.data, 4);
  const colorType = header.data[9];
  if (!width || !height || width > 32768 || height > 0x7fffffff) return null;
  if (header.data[8] !== 8 || (colorType !== 2 && colorType !== 6)) return null;
  if (header.data[10] !== 0 || header.data[11] !== 0 || header.data[12] !== 0) return null;
  const channels = colorType === 6 ? 4 : 3;
  if ((width * channels + 1) * height > maxFilteredBytes) return null;
  return {
    width,
    height,
    channels,
    chunks,
    imageData,
    canRemoveAlpha: !chunks.some((entry) => COLOR_TYPE_METADATA.has(entry.type)),
  };
}

/** Builds one PNG chunk with a CRC over its type and payload. */
function makePngChunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const encoded = new Uint8Array(data.length + 12);
  const view = new DataView(encoded.buffer);
  view.setUint32(0, data.length);
  encoded.set(new TextEncoder().encode(type), 4);
  encoded.set(data, 8);
  view.setUint32(encoded.length - 4, crc32(encoded.subarray(4, -4)));
  return encoded;
}

function paeth(left: number, up: number, upperLeft: number): number {
  const p = left + up - upperLeft;
  const a = Math.abs(p - left);
  const b = Math.abs(p - up);
  const c = Math.abs(p - upperLeft);
  return a <= b && a <= c ? left : b <= c ? up : upperLeft;
}

function predictor(filter: number, left: number, up: number, upperLeft: number): number {
  switch (filter) {
    case 0:
      return 0;
    case 1:
      return left;
    case 2:
      return up;
    case 3:
      return (left + up) >>> 1;
    case 4:
      return paeth(left, up, upperLeft);
    default:
      throw new Error('Invalid PNG row filter.');
  }
}

/** Reconstructs a row in place; both rows include the leading filter byte. */
export function unfilterPngRow(row: Uint8Array, previous: Uint8Array, channels: number): void {
  const filter = row[0]!;
  for (let index = 1; index < row.length; index += 1) {
    row[index] =
      row[index]! +
      predictor(
        filter,
        index > channels ? row[index - channels]! : 0,
        previous[index]!,
        index > channels ? previous[index - channels]! : 0
      );
  }
  row[0] = 0;
}

function chooseRowFilter(row: Uint8Array, previous: Uint8Array, channels: number): number {
  const scores = [0, 0, 0, 0, 0];
  const step = Math.max(1, Math.floor((row.length - 1) / 64));
  for (let index = 1; index < row.length; index += step) {
    const left = index > channels ? row[index - channels]! : 0;
    const up = previous[index]!;
    const upperLeft = index > channels ? previous[index - channels]! : 0;
    for (let filter = 0; filter <= 4; filter += 1) {
      const value = (row[index]! - predictor(filter, left, up, upperLeft)) & 255;
      scores[filter] = scores[filter]! + Math.min(value, 256 - value);
    }
  }
  return scores.indexOf(Math.min(...scores));
}

/** Samples each row to select a reversible filter without five full-row scans. */
export function filterPngRow(row: Uint8Array, previous: Uint8Array, channels: number): Uint8Array {
  const filter = chooseRowFilter(row, previous, channels);
  const output = new Uint8Array(row.length);
  output[0] = filter;
  for (let index = 1; index < row.length; index += 1) {
    output[index] =
      row[index]! -
      predictor(
        filter,
        index > channels ? row[index - channels]! : 0,
        previous[index]!,
        index > channels ? previous[index - channels]! : 0
      );
  }
  return output;
}

/** Preserves all original chunks except the replaced IHDR and contiguous IDAT sequence. */
export function assembleOptimizedPng(
  png: BrowserPng,
  channels: 3 | 4,
  compressed: Uint8Array[]
): Blob {
  const parts: BlobPart[] = [Uint8Array.from(SIGNATURE)];
  let wroteImageData = false;
  for (const entry of png.chunks) {
    if (entry.type === 'IHDR') {
      const header = entry.data.slice();
      header[9] = channels === 4 ? 6 : 2;
      parts.push(makePngChunk('IHDR', header));
    } else if (entry.type === 'IDAT') {
      if (wroteImageData) continue;
      wroteImageData = true;
      for (const bytes of compressed) parts.push(makePngChunk('IDAT', bytes));
    } else parts.push(Uint8Array.from(entry.encoded));
  }
  return new Blob(parts, { type: 'image/png' });
}
