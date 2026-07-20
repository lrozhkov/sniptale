interface TestZipEntry {
  compressedSize?: number;
  data: number[];
  descriptor?: boolean;
  externalAttributes?: number;
  flags?: number;
  name: string;
  uncompressedSize?: number;
  versionMadeBy?: number;
}

export function createZip(entries: TestZipEntry[]): Uint8Array {
  const bytes: number[] = [];
  const central = entries.map((entry) => appendLocalEntry(bytes, entry));
  const centralOffset = bytes.length;
  for (const built of central) appendCentralEntry(bytes, built);
  appendEndOfCentralDirectory(bytes, entries.length, centralOffset);
  return Uint8Array.from(bytes);
}

function appendLocalEntry(
  bytes: number[],
  entry: TestZipEntry
): { entry: TestZipEntry; flags: number; localOffset: number } {
  const localOffset = bytes.length;
  const flags = (entry.flags ?? 0) | (entry.descriptor ? 0x0008 : 0);
  const name = ascii(entry.name);
  const compressedSize = entry.compressedSize ?? entry.data.length;
  const uncompressedSize = entry.uncompressedSize ?? entry.data.length;
  u32(bytes, 0x04034b50);
  u16(bytes, 20);
  u16(bytes, flags);
  u16(bytes, 0);
  u16(bytes, 0);
  u16(bytes, 0);
  u32(bytes, entry.descriptor ? 0 : 0x12345678);
  u32(bytes, entry.descriptor ? 0 : compressedSize);
  u32(bytes, entry.descriptor ? 0 : uncompressedSize);
  u16(bytes, name.length);
  u16(bytes, 0);
  bytes.push(...name, ...entry.data);
  if (entry.descriptor) appendDataDescriptor(bytes, compressedSize, uncompressedSize);
  return { entry, flags, localOffset };
}

function appendDataDescriptor(
  bytes: number[],
  compressedSize: number,
  uncompressedSize: number
): void {
  u32(bytes, 0x08074b50);
  u32(bytes, 0x12345678);
  u32(bytes, compressedSize);
  u32(bytes, uncompressedSize);
}

function appendCentralEntry(
  bytes: number[],
  built: { entry: TestZipEntry; flags: number; localOffset: number }
): void {
  const { entry, flags, localOffset } = built;
  const name = ascii(entry.name);
  u32(bytes, 0x02014b50);
  u16(bytes, entry.versionMadeBy ?? 20);
  u16(bytes, 20);
  u16(bytes, flags);
  u16(bytes, 0);
  u16(bytes, 0);
  u16(bytes, 0);
  u32(bytes, 0x12345678);
  u32(bytes, entry.compressedSize ?? entry.data.length);
  u32(bytes, entry.uncompressedSize ?? entry.data.length);
  u16(bytes, name.length);
  u16(bytes, 0);
  u16(bytes, 0);
  u16(bytes, 0);
  u16(bytes, 0);
  u32(bytes, entry.externalAttributes ?? (entry.name.endsWith('/') ? 0x10 : 0));
  u32(bytes, localOffset);
  bytes.push(...name);
}

function appendEndOfCentralDirectory(
  bytes: number[],
  entryCount: number,
  centralOffset: number
): void {
  const centralSize = bytes.length - centralOffset;
  u32(bytes, 0x06054b50);
  u16(bytes, 0);
  u16(bytes, 0);
  u16(bytes, entryCount);
  u16(bytes, entryCount);
  u32(bytes, centralSize);
  u32(bytes, centralOffset);
  u16(bytes, 0);
}

export function createZip64(): Uint8Array {
  const bytes: number[] = [];
  const name = ascii('manifest.json');
  appendZip64LocalEntry(bytes, name);
  const centralOffset = bytes.length;
  appendZip64CentralEntry(bytes, name);
  const centralSize = bytes.length - centralOffset;
  appendZip64EndRecords(bytes, centralOffset, centralSize);
  return Uint8Array.from(bytes);
}

function appendZip64LocalEntry(bytes: number[], name: number[]): void {
  u32(bytes, 0x04034b50);
  u16(bytes, 45);
  u16(bytes, 0);
  u16(bytes, 0);
  u16(bytes, 0);
  u16(bytes, 0);
  u32(bytes, 0x12345678);
  u32(bytes, 1);
  u32(bytes, 1);
  u16(bytes, name.length);
  u16(bytes, 0);
  bytes.push(...name, 1);
}

function appendZip64CentralEntry(bytes: number[], name: number[]): void {
  u32(bytes, 0x02014b50);
  u16(bytes, 45);
  u16(bytes, 45);
  u16(bytes, 0);
  u16(bytes, 0);
  u16(bytes, 0);
  u16(bytes, 0);
  u32(bytes, 0x12345678);
  u32(bytes, 0xffffffff);
  u32(bytes, 0xffffffff);
  u16(bytes, name.length);
  u16(bytes, 28);
  u16(bytes, 0);
  u16(bytes, 0);
  u16(bytes, 0);
  u32(bytes, 0);
  u32(bytes, 0xffffffff);
  bytes.push(...name);
  u16(bytes, 0x0001);
  u16(bytes, 24);
  u64(bytes, 1);
  u64(bytes, 1);
  u64(bytes, 0);
}

function appendZip64EndRecords(bytes: number[], centralOffset: number, centralSize: number): void {
  const zip64Offset = bytes.length;
  u32(bytes, 0x06064b50);
  u64(bytes, 44);
  u16(bytes, 45);
  u16(bytes, 45);
  u32(bytes, 0);
  u32(bytes, 0);
  u64(bytes, 1);
  u64(bytes, 1);
  u64(bytes, centralSize);
  u64(bytes, centralOffset);
  u32(bytes, 0x07064b50);
  u32(bytes, 0);
  u64(bytes, zip64Offset);
  u32(bytes, 1);
  u32(bytes, 0x06054b50);
  u16(bytes, 0);
  u16(bytes, 0);
  u16(bytes, 0xffff);
  u16(bytes, 0xffff);
  u32(bytes, 0xffffffff);
  u32(bytes, 0xffffffff);
  u16(bytes, 0);
}

function ascii(value: string): number[] {
  return [...value].map((character) => character.charCodeAt(0));
}

function u16(target: number[], value: number): void {
  target.push(value & 0xff, (value >>> 8) & 0xff);
}

function u32(target: number[], value: number): void {
  target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function u64(target: number[], value: number): void {
  u32(target, value);
  u32(target, 0);
}
