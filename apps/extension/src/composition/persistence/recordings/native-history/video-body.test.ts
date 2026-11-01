import { sha256 } from '@noble/hashes/sha2.js';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryFileHandle, createHarness } from '../../assets/opfs-store.test-support';
import type { AssetRef } from '../../assets/contracts';
import { verifyNativeRecordingBody } from './video-body';
const hex = (bytes: Uint8Array) =>
  Array.from(sha256(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fixture() {
  const harness = createHarness();
  let now = 100;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const getFile = MemoryFileHandle.prototype.getFile;
  vi.spyOn(MemoryFileHandle.prototype, 'getFile').mockImplementation(async function (
    this: MemoryFileHandle
  ) {
    const file = await getFile.call(this);
    return new File([file], 'memory-file', { lastModified: Date.now() });
  });
  vi.stubGlobal('navigator', { storage: { getDirectory: harness.options.getOriginRoot } });
  const root = await harness.root.getDirectoryHandle('sniptale-assets', { create: true });
  const objects = await root.getDirectoryHandle('objects', { create: true });
  const assetId = crypto.randomUUID();
  const handle = await objects.getFileHandle(assetId, { create: true });
  const bytes = new Uint8Array(131089).fill(7);
  const write = async (value: Uint8Array) => {
    const writable = await handle.createWritable();
    await writable.write(new Uint8Array(value));
    await writable.close();
  };
  await write(bytes);
  const ref: AssetRef = {
    assetId,
    createdAt: 1,
    location: { kind: 'opfs', objectKey: `objects/${assetId}` },
    mimeType: 'video/mp4',
    sha256: null,
    size: bytes.length,
  };
  return {
    ref,
    bytes,
    write,
    remove: () => objects.removeEntry(assetId),
    advance: () => {
      now++;
    },
  };
}
it('verifies nullable SHA bodies in 64-KiB slices and caches only an unchanged immutable version', async () => {
  const data = await fixture();
  const sizes: number[] = [];
  const original = Blob.prototype.arrayBuffer;
  vi.spyOn(Blob.prototype, 'arrayBuffer').mockImplementation(function (this: Blob) {
    sizes.push(this.size);
    return original.call(this);
  });
  await verifyNativeRecordingBody(data.ref, hex(data.bytes));
  expect(sizes).toEqual([65536, 65536, 17]);
  await verifyNativeRecordingBody(data.ref, hex(data.bytes));
  expect(sizes).toHaveLength(3);
  await data.remove();
  await expect(verifyNativeRecordingBody(data.ref, hex(data.bytes))).rejects.toThrow();
});
it('refuses a changed same-size body after its file version changes', async () => {
  const data = await fixture();
  await verifyNativeRecordingBody(data.ref, hex(data.bytes));
  data.advance();
  await data.write(new Uint8Array(data.bytes.length).fill(8));
  await expect(verifyNativeRecordingBody(data.ref, hex(data.bytes))).rejects.toMatchObject({
    code: 'stale-root',
  });
});
