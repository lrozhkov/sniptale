import { expect, it } from 'vitest';

import { decodeRuntimeMessageBlobs, encodeRuntimeMessageBlobs } from './runtime-message-blob-codec';

it('recursively round-trips bounded blobs while preserving non-blob values', async () => {
  const bytes = new Uint8Array([0, 1, 254, 255]);
  const preservedBytes = new Uint8Array([7]);
  const encoded = await encodeRuntimeMessageBlobs({
    items: [new Blob([bytes], { type: 'application/octet-stream' }), 'plain', null],
    nested: { count: 4 },
    preservedBytes,
  });
  const decoded = expectRecord(decodeRuntimeMessageBlobs(encoded));
  const items = expectArray(decoded['items']);
  const decodedBlob = expectBlob(items[0]);

  expect(new Uint8Array(await decodedBlob.arrayBuffer())).toEqual(bytes);
  expect(decodedBlob.type).toBe('application/octet-stream');
  expect(items.slice(1)).toEqual(['plain', null]);
  expect(decoded['nested']).toEqual({ count: 4 });
  expect(decoded['preservedBytes']).toBe(preservedBytes);
});

it('rejects a decoded runtime blob whose byte length does not match its envelope', () => {
  expect(() =>
    decodeRuntimeMessageBlobs({
      __sniptaleRuntimeBlob: true,
      base64: 'AAH+/w==',
      mimeType: 'application/octet-stream',
      size: 3,
    })
  ).toThrow('Runtime message blob payload size mismatch');
});

it('rejects oversized and invalid runtime blob envelopes before allocation', async () => {
  const oversizedSize = 2 * 1024 * 1024 + 1;

  await expect(
    encodeRuntimeMessageBlobs(new Blob([new Uint8Array(oversizedSize)]))
  ).rejects.toThrow('Runtime message blob payload exceeds message budget');
  for (const size of [-1, 1.5, oversizedSize]) {
    expect(() =>
      decodeRuntimeMessageBlobs({
        __sniptaleRuntimeBlob: true,
        base64: 'AA==',
        mimeType: 'application/octet-stream',
        size,
      })
    ).toThrow('Runtime message blob payload exceeds message budget');
  }
  expect(() =>
    decodeRuntimeMessageBlobs({
      __sniptaleRuntimeBlob: true,
      base64: 'A'.repeat(2_796_205),
      mimeType: 'application/octet-stream',
      size: 1,
    })
  ).toThrow('Runtime message blob payload exceeds message budget');
});

function expectRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error('Expected record');
  }
  return value;
}

function expectArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error('Expected array');
  }
  return value;
}

function expectBlob(value: unknown): Blob {
  if (!(value instanceof Blob)) {
    throw new Error('Expected blob');
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Blob);
}
