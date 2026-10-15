import { expect, it } from 'vitest';
import { parseSharedRootEnvelope, sharedRootEnvelopeValue } from './shared-object-envelope';
import { parseRootEnvelope } from './codec';

const table = [
  {
    id: 'shared-one',
    path: 'Screenshots/source.png',
    mimeType: 'image/png',
    size: 3,
    sha256: 'a'.repeat(64),
  },
];
const direct = {
  objectId: 'one',
  filename: 'one.png',
  mimeType: 'image/png',
  size: 3,
  path: 'Screenshots/.shared-admission/1.bin',
};
const alias = {
  objectId: 'two',
  filename: 'two.png',
  mimeType: 'image/png',
  size: 3,
  sharedObjectId: table[0]!.id,
};
const envelope = {
  descriptor: {
    rootId: 'root',
    rootKind: 'media',
    mediaSubtype: 'library-item',
    metadataPath: '_sniptale/metadata/media/root.json',
    objectCount: 2,
    totalBytes: 6,
  },
  metadata: {},
  objects: [direct, alias],
};

it('keeps local IDs and filenames while resolving only the explicit physical entry', () => {
  const result = parseSharedRootEnvelope(envelope, table);
  expect(result.directObjects).toEqual([direct]);
  expect(result.sharedIds).toEqual(['shared-one']);
  expect(result.envelope.objects[1]).toEqual({
    objectId: 'two',
    filename: 'two.png',
    mimeType: 'image/png',
    size: 3,
    path: table[0]!.path,
  });
  expect(sharedRootEnvelopeValue(result.envelope, new Map([['two', 'shared-one']]))).toEqual(
    envelope
  );
});

it('keeps legacy root-local admission closed to aliases', () => {
  expect(() => parseRootEnvelope(envelope)).toThrow();
});

it.each([
  null,
  {},
  { ...envelope, objects: null },
  { ...envelope, objects: [direct, { ...alias, extra: 1 }] },
  { ...envelope, objects: [direct, { ...alias, mimeType: 'audio/wav' }] },
  { ...envelope, objects: [direct, { ...alias, sharedObjectId: 'missing' }] },
])('refuses malformed v3 envelopes %#', (raw) => {
  expect(() => parseSharedRootEnvelope(raw, table)).toThrow();
});
