/**
 * Packfile and loose-object helpers for the sandbox-safe git reader.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function readUInt32(buffer, offset) {
  return buffer.readUInt32BE(offset);
}

function readUInt64(buffer, offset) {
  return Number(buffer.readBigUInt64BE(offset));
}

export function parseObjectBuffer(buffer) {
  const headerEnd = buffer.indexOf(0);
  const header = buffer.subarray(0, headerEnd).toString('utf8');

  return {
    type: header.split(' ', 1)[0],
    body: buffer.subarray(headerEnd + 1),
  };
}

function parsePackOffset(buffer, offset) {
  let cursor = offset;
  let value = buffer[cursor] & 0x7f;

  while (buffer[cursor] & 0x80) {
    cursor += 1;
    value += 1;
    value = (value << 7) + (buffer[cursor] & 0x7f);
  }

  return { offsetDelta: value, nextOffset: cursor + 1 };
}

function readDeltaSize(buffer, offset) {
  let cursor = offset;
  let size = 0;
  let shift = 0;

  while (cursor < buffer.length) {
    const byte = buffer[cursor];
    size |= (byte & 0x7f) << shift;
    cursor += 1;
    if ((byte & 0x80) === 0) {
      break;
    }
    shift += 7;
  }

  return { size, nextOffset: cursor };
}

function applyDelta(baseBody, deltaBody) {
  let { nextOffset } = readDeltaSize(deltaBody, 0);
  const target = readDeltaSize(deltaBody, nextOffset);
  nextOffset = target.nextOffset;

  const chunks = [];
  let totalLength = 0;

  while (nextOffset < deltaBody.length) {
    const opcode = deltaBody[nextOffset++];

    if (opcode & 0x80) {
      let copyOffset = 0;
      let copySize = 0;

      if (opcode & 0x01) copyOffset |= deltaBody[nextOffset++];
      if (opcode & 0x02) copyOffset |= deltaBody[nextOffset++] << 8;
      if (opcode & 0x04) copyOffset |= deltaBody[nextOffset++] << 16;
      if (opcode & 0x08) copyOffset |= deltaBody[nextOffset++] << 24;
      if (opcode & 0x10) copySize |= deltaBody[nextOffset++];
      if (opcode & 0x20) copySize |= deltaBody[nextOffset++] << 8;
      if (opcode & 0x40) copySize |= deltaBody[nextOffset++] << 16;

      const chunk = baseBody.subarray(copyOffset, copyOffset + (copySize || 0x10000));
      chunks.push(chunk);
      totalLength += chunk.length;
      continue;
    }

    const chunk = deltaBody.subarray(nextOffset, nextOffset + opcode);
    chunks.push(chunk);
    totalLength += chunk.length;
    nextOffset += opcode;
  }

  const result = Buffer.concat(chunks, totalLength);
  if (result.length !== target.size) {
    throw new Error('Git delta application produced an unexpected object size');
  }

  return result;
}

function readPackedObjectAt(packBuffer, offset, resolveObject) {
  let cursor = offset;
  const firstByte = packBuffer[cursor];
  const typeCode = (firstByte >> 4) & 0x07;
  cursor += 1;

  while (packBuffer[cursor - 1] & 0x80) {
    cursor += 1;
  }

  if (typeCode === 6) {
    const base = parsePackOffset(packBuffer, cursor);
    const delta = zlib.inflateSync(packBuffer.subarray(base.nextOffset));
    const baseObject = readPackedObjectAt(packBuffer, offset - base.offsetDelta, resolveObject);

    return { type: baseObject.type, body: applyDelta(baseObject.body, delta) };
  }

  if (typeCode === 7) {
    const baseOid = packBuffer.subarray(cursor, cursor + 20).toString('hex');
    const delta = zlib.inflateSync(packBuffer.subarray(cursor + 20));
    const baseObject = resolveObject(baseOid);

    return { type: baseObject.type, body: applyDelta(baseObject.body, delta) };
  }

  return {
    type: { 1: 'commit', 2: 'tree', 3: 'blob', 4: 'tag' }[typeCode],
    body: zlib.inflateSync(packBuffer.subarray(cursor)),
  };
}

export function readLooseObject(gitDir, oid) {
  const objectPath = path.join(gitDir, 'objects', oid.slice(0, 2), oid.slice(2));
  if (!fs.existsSync(objectPath)) {
    return null;
  }

  return parseObjectBuffer(zlib.inflateSync(fs.readFileSync(objectPath)));
}

function collectIndexOffsets(buffer, oidStart, offsetStart, objectCount) {
  const oidToOffset = new Map();
  const largeOffsets = [];

  for (let index = 0; index < objectCount; index += 1) {
    const oid = buffer.subarray(oidStart + index * 20, oidStart + (index + 1) * 20).toString('hex');
    const offsetValue = readUInt32(buffer, offsetStart + index * 4);
    if (offsetValue & 0x80000000) {
      largeOffsets[index] = offsetValue & 0x7fffffff;
    } else {
      oidToOffset.set(oid, offsetValue);
    }
  }

  return { largeOffsets, oidToOffset };
}

function addLargeIndexOffsets(buffer, oidStart, largeOffsetStart, largeOffsets, oidToOffset) {
  for (let index = 0; index < largeOffsets.length; index += 1) {
    const largeOffsetIndex = largeOffsets[index];
    if (largeOffsetIndex == null) {
      continue;
    }

    const oid = buffer.subarray(oidStart + index * 20, oidStart + (index + 1) * 20).toString('hex');
    oidToOffset.set(oid, readUInt64(buffer, largeOffsetStart + largeOffsetIndex * 8));
  }
}

function loadPackIndex(idxPath) {
  const packPath = idxPath.replace(/\.idx$/u, '.pack');
  const buffer = fs.readFileSync(idxPath);
  const fanoutStart = buffer.subarray(0, 4).equals(Buffer.from([0xff, 0x74, 0x4f, 0x63])) ? 8 : 0;
  const objectCount = readUInt32(buffer, fanoutStart + 255 * 4);
  const oidStart = fanoutStart + 256 * 4;
  const offsetStart = oidStart + objectCount * 24;
  const largeOffsetStart = offsetStart + objectCount * 4;
  const { largeOffsets, oidToOffset } = collectIndexOffsets(
    buffer,
    oidStart,
    offsetStart,
    objectCount
  );

  addLargeIndexOffsets(buffer, oidStart, largeOffsetStart, largeOffsets, oidToOffset);

  return {
    oidToOffset,
    packBuffer: fs.readFileSync(packPath),
  };
}

export function loadPackIndexes(gitDir) {
  const packDir = path.join(gitDir, 'objects', 'pack');
  if (!fs.existsSync(packDir)) {
    return [];
  }

  return fs
    .readdirSync(packDir)
    .filter((fileName) => fileName.endsWith('.idx'))
    .map((fileName) => loadPackIndex(path.join(packDir, fileName)));
}

export function readPackedObject(packIndexes, oid, resolveObject) {
  for (const packIndex of packIndexes) {
    const offset = packIndex.oidToOffset.get(oid);
    if (offset != null) {
      return readPackedObjectAt(packIndex.packBuffer, offset, resolveObject);
    }
  }

  return null;
}
