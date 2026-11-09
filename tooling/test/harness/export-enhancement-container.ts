interface Box {
  type: string;
  start: number;
  end: number;
  payload: number;
}
function mp4Boxes(bytes: Uint8Array, start = 0, end = bytes.length): Box[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    result: Box[] = [];
  for (let position = start; position + 8 <= end;) {
    let size = view.getUint32(position),
      header = 8;
    const type = String.fromCharCode(...bytes.subarray(position + 4, position + 8));
    if (size === 1) {
      size = Number(view.getBigUint64(position + 8));
      header = 16;
    }
    if (size === 0) size = end - position;
    if (!Number.isSafeInteger(size) || size < header || position + size > end)
      throw new Error('MP4 box bounds are invalid.');
    result.push({ type, start: position, end: position + size, payload: position + header });
    position += size;
  }
  return result;
}
function fragmentedMp4Index(bytes: Uint8Array, boxes: readonly Box[], moov: Box | undefined) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const children = (box: Box) => mp4Boxes(bytes, box.payload, box.end);
  const videoIds = new Set<number>();
  for (const trak of moov ? children(moov).filter((box) => box.type === 'trak') : []) {
    const tkhd = children(trak).find((box) => box.type === 'tkhd'),
      mdia = children(trak).find((box) => box.type === 'mdia');
    const hdlr = mdia && children(mdia).find((box) => box.type === 'hdlr');
    if (
      tkhd &&
      hdlr &&
      String.fromCharCode(...bytes.subarray(hdlr.payload + 8, hdlr.payload + 12)) === 'vide'
    )
      videoIds.add(view.getUint32(tkhd.payload + (bytes[tkhd.payload] === 1 ? 20 : 12)));
  }
  const sync = new Set<string>();
  let fragmentSamples = 0,
    fragmentSyncSamples = 0,
    randomAccessEntries = 0;
  const fragments = boxes.filter((box) => box.type === 'moof');
  for (const moof of fragments) {
    const trafs = children(moof).filter((box) => box.type === 'traf');
    for (const [trafIndex, traf] of trafs.entries()) {
      const members = children(traf),
        tfhd = members.find((box) => box.type === 'tfhd');
      if (!tfhd || !videoIds.has(view.getUint32(tfhd.payload + 4))) continue;
      const flags = view.getUint32(tfhd.payload) & 0xffffff;
      let cursor = tfhd.payload + 8;
      if (flags & 1) cursor += 8;
      if (flags & 2) cursor += 4;
      if (flags & 8) cursor += 4;
      if (flags & 16) cursor += 4;
      const defaultFlags = flags & 32 ? view.getUint32(cursor) : 0;
      for (const [trunIndex, trun] of members.filter((box) => box.type === 'trun').entries()) {
        const runFlags = view.getUint32(trun.payload) & 0xffffff,
          count = view.getUint32(trun.payload + 4);
        if (count > bytes.length) throw new Error('MP4 fragment sample count is invalid.');
        cursor = trun.payload + 8;
        if (runFlags & 1) cursor += 4;
        const firstFlags = runFlags & 4 ? view.getUint32(cursor) : defaultFlags;
        if (runFlags & 4) cursor += 4;
        for (let i = 0; i < count; i++) {
          if (runFlags & 256) cursor += 4;
          if (runFlags & 512) cursor += 4;
          const sampleFlags =
            runFlags & 1024 ? view.getUint32(cursor) : i === 0 ? firstFlags : defaultFlags;
          if (runFlags & 1024) cursor += 4;
          if (runFlags & 2048) cursor += 4;
          if (cursor > trun.end) throw new Error('MP4 fragment sample bounds are invalid.');
          fragmentSamples++;
          if (!(sampleFlags & 0x10000)) {
            fragmentSyncSamples++;
            sync.add(`${moof.start}:${trafIndex + 1}:${trunIndex + 1}:${i + 1}`);
          }
        }
      }
    }
  }
  const readInteger = (position: number, width: number, end: number) => {
    if (position + width > end) throw new Error('MP4 random access entry bounds are invalid.');
    let value = 0;
    for (let i = 0; i < width; i++) value = value * 256 + bytes[position + i]!;
    if (!Number.isSafeInteger(value)) throw new Error('MP4 random access integer is invalid.');
    return value;
  };
  for (const mfra of boxes.filter((box) => box.type === 'mfra'))
    for (const tfra of children(mfra).filter((box) => box.type === 'tfra')) {
      if (!videoIds.has(view.getUint32(tfra.payload + 4))) continue;
      const widths = view.getUint32(tfra.payload + 8),
        count = view.getUint32(tfra.payload + 12),
        timeWidth = bytes[tfra.payload] === 1 ? 8 : 4;
      if (count > bytes.length / 8) throw new Error('MP4 random access count is invalid.');
      let cursor = tfra.payload + 16;
      for (let i = 0; i < count; i++) {
        readInteger(cursor, timeWidth, tfra.end);
        cursor += timeWidth;
        const offset = readInteger(cursor, timeWidth, tfra.end);
        cursor += timeWidth;
        const trafWidth = ((widths >> 4) & 3) + 1,
          trunWidth = ((widths >> 2) & 3) + 1,
          sampleWidth = (widths & 3) + 1;
        const traf = readInteger(cursor, trafWidth, tfra.end);
        cursor += trafWidth;
        const trun = readInteger(cursor, trunWidth, tfra.end);
        cursor += trunWidth;
        const sample = readInteger(cursor, sampleWidth, tfra.end);
        cursor += sampleWidth;
        if (!sync.has(`${offset}:${traf}:${trun}:${sample}`))
          throw new Error('MP4 random access entry does not identify a video sync sample.');
        randomAccessEntries++;
      }
    }
  return { fragments: fragments.length, fragmentSamples, fragmentSyncSamples, randomAccessEntries };
}
function mp4Index(bytes: Uint8Array) {
  const boxes = mp4Boxes(bytes),
    moov = boxes.find((box) => box.type === 'moov'),
    mdat = boxes.find((box) => box.type === 'mdat');
  let sampleTables = 0,
    explicitSyncSamples = 0;
  function visit(box: Box) {
    if (box.type === 'stbl') sampleTables++;
    if (box.type === 'stss')
      explicitSyncSamples += new DataView(bytes.buffer, bytes.byteOffset).getUint32(
        box.payload + 4
      );
    if (['moov', 'trak', 'mdia', 'minf', 'stbl'].includes(box.type))
      for (const child of mp4Boxes(bytes, box.payload, box.end)) visit(child);
  }
  if (moov) visit(moov);
  return {
    type: 'mp4' as const,
    fastStart: Boolean(moov && mdat && moov.start < mdat.start),
    sampleTables,
    explicitSyncSamples,
    ...fragmentedMp4Index(bytes, boxes, moov),
  };
}
function ebmlNumber(bytes: Uint8Array, offset: number, identifier: boolean) {
  const first = bytes[offset];
  if (!first) throw new Error('EBML element is invalid.');
  let width = 1;
  while (width <= 8 && !(first & (1 << (8 - width)))) width++;
  if (width > 8 || offset + width > bytes.length) throw new Error('EBML length is invalid.');
  let value = identifier ? first : first & ((1 << (8 - width)) - 1);
  let unknown = !identifier && value === (1 << (8 - width)) - 1;
  for (let i = 1; i < width; i++) {
    value = value * 256 + bytes[offset + i]!;
    unknown &&= bytes[offset + i] === 255;
  }
  return { value, width, unknown };
}
function webmIndex(bytes: Uint8Array) {
  let cues = 0,
    clusters = 0,
    seekHeads = 0;
  function visit(start: number, end: number, depth: number) {
    if (depth > 5) throw new Error('EBML nesting is invalid.');
    for (let position = start; position < end;) {
      const id = ebmlNumber(bytes, position, true),
        size = ebmlNumber(bytes, position + id.width, false);
      const payload = position + id.width + size.width,
        elementEnd = size.unknown ? end : payload + size.value;
      if (!Number.isSafeInteger(elementEnd) || elementEnd > end || elementEnd < payload)
        throw new Error('EBML element bounds are invalid.');
      if (id.value === 0x1f43b675) clusters++;
      if (id.value === 0x114d9b74) seekHeads++;
      if (id.value === 0xbb) cues++;
      if ([0x18538067, 0x1c53bb6b].includes(id.value)) visit(payload, elementEnd, depth + 1);
      position = elementEnd;
    }
  }
  visit(0, bytes.length, 0);
  return { type: 'webm' as const, cues, clusters, seekHeads };
}
/** Reads completed proof-file indexes without retaining or modifying the borrowed bytes. */
export function inspectEnhancementContainer(bytes: Uint8Array) {
  return String.fromCharCode(...bytes.subarray(4, 8)) === 'ftyp'
    ? mp4Index(bytes)
    : webmIndex(bytes);
}
