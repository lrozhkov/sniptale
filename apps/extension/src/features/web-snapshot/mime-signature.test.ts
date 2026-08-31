import { expect, it } from 'vitest';
import { assertWebSnapshotMimeSignature } from './mime-signature';

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

it.each([
  ['font/woff', bytes('wOFF')],
  ['font/woff2', bytes('wOF2')],
  ['image/gif', bytes('GIF87a')],
  ['image/gif', bytes('GIF89a')],
  ['image/jpeg', Uint8Array.from([0xff, 0xd8, 0xff])],
  ['image/png', Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  ['image/webp', bytes('RIFFxxxxWEBP')],
  ['image/avif', bytes('xxxxftypavifxxxx')],
])('accepts a matching %s container signature', (mimeType, header) => {
  expect(() => assertWebSnapshotMimeSignature(header, mimeType, 'assets/file')).not.toThrow();
});

it('allows text MIME types without pretending they have binary magic bytes', () => {
  expect(() =>
    assertWebSnapshotMimeSignature(bytes('body {}'), 'text/css', 'assets/a.css')
  ).not.toThrow();
});

it.each([
  'font/woff',
  'font/woff2',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
])('rejects a mismatched %s container signature', (mimeType) => {
  expect(() => assertWebSnapshotMimeSignature(bytes('invalid'), mimeType, 'assets/file')).toThrow(
    'MIME signature'
  );
});
